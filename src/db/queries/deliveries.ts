import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../client';
import { deliveryAttempts } from '../schema';

export async function dbCreateDeliveryAttempts(
  jobId: string,
  subscriberUrls: string[]
) {
  if (subscriberUrls.length === 0) return [];
  return db
    .insert(deliveryAttempts)
    .values(subscriberUrls.map((url) => ({ jobId, subscriberUrl: url })))
    .returning();
}

export async function dbGetPendingDeliveries(batchSize = 10) {
  return db
    .select()
    .from(deliveryAttempts)
    .where(
      and(
        eq(deliveryAttempts.status, 'pending'),
        or(
          isNull(deliveryAttempts.nextRetryAt),
          lte(deliveryAttempts.nextRetryAt, new Date())
        )
      )
    )
    .orderBy(deliveryAttempts.createdAt)
    .limit(batchSize);
}

export async function dbMarkDeliverySuccess(
  id: string,
  responseStatus: number,
  responseBody: string
) {
  const rows = await db
    .update(deliveryAttempts)
    .set({ status: 'success', responseStatus, responseBody, updatedAt: new Date() })
    .where(eq(deliveryAttempts.id, id))
    .returning();
  return rows[0];
}

export async function dbMarkDeliveryRetryOrFail(
  id: string,
  error: string,
  nextRetryAt: Date | null,
  responseStatus?: number
) {
  const rows = await db
    .update(deliveryAttempts)
    .set({
      attemptCount: sql`${deliveryAttempts.attemptCount} + 1`,
      status: nextRetryAt ? 'pending' : 'failed',
      error,
      responseStatus: responseStatus ?? null,
      nextRetryAt,
      updatedAt: new Date(),
    })
    .where(eq(deliveryAttempts.id, id))
    .returning();
  return rows[0];
}