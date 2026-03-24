import { config } from '../config';
import {
  dbGetPendingDeliveries,
  dbMarkDeliveryRetryOrFail,
  dbMarkDeliverySuccess,
} from '../db/queries/deliveries';
import { dbGetJobById } from '../db/queries/jobs';

const BASE_DELAY_MS = 5_000;


function calculateNextRetryAt(attemptCount: number): Date {
  const delayMs = Math.pow(2, attemptCount) * BASE_DELAY_MS;
  return new Date(Date.now() + delayMs);
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}


async function postToSubscriber(
  url: string,
  payload: unknown
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000), // 10s timeout per attempt
  });
  const body = await response.text();
  return { status: response.status, body };
}



async function handleSuccess(
  id: string,
  url: string,
  status: number,
  body: string
) {
  await dbMarkDeliverySuccess(id, status, body);
  console.log(`[delivery] ✓ ${url} — ${status}`);
}

async function handleFailure(
  delivery: { id: string; subscriberUrl: string; attemptCount: number },
  error: string,
  responseStatus?: number
) {
  const newCount = delivery.attemptCount + 1;
  const isLastAttempt = newCount >= config.MAX_DELIVERY_ATTEMPTS;
  const nextRetryAt = isLastAttempt ? null : calculateNextRetryAt(newCount);

  await dbMarkDeliveryRetryOrFail(delivery.id, error, nextRetryAt, responseStatus);

  if (isLastAttempt) {
    console.error(`[delivery] ✗ ${delivery.subscriberUrl} — permanently failed after ${newCount} attempt(s)`);
  } else {
    const delaySec = Math.pow(2, newCount) * (BASE_DELAY_MS / 1000);
    console.warn(`[delivery] ✗ ${delivery.subscriberUrl} — retry in ${delaySec}s (attempt ${newCount}/${config.MAX_DELIVERY_ATTEMPTS})`);
  }
}

async function processOneDelivery(
  delivery: Awaited<ReturnType<typeof dbGetPendingDeliveries>>[number]
) {
  const job = await dbGetJobById(delivery.jobId);
  if (!job?.result) {
    console.warn(`[delivery] No result found for job ${delivery.jobId} — skipping`);
    return;
  }

  try {
    const { status, body } = await postToSubscriber(delivery.subscriberUrl, job.result);

    if (isSuccess(status)) {
      await handleSuccess(delivery.id, delivery.subscriberUrl, status, body);
    } else {
      await handleFailure(delivery, `HTTP ${status}: ${body}`, status);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await handleFailure(delivery, message);
  }
}


export async function processDeliveries() {
  const pending = await dbGetPendingDeliveries(10);
  for (const delivery of pending) {
    await processOneDelivery(delivery);
  }
}