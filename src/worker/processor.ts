import { executeAction } from '../actions';
import { dbCreateDeliveryAttempts } from '../db/queries/deliveries';
import { dbMarkJobCompleted, dbMarkJobFailed } from '../db/queries/jobs';
import { dbGetPipelineById, dbGetSubscribersByPipelineId } from '../db/queries/pipelines';
import { type ClaimedJob } from '../queue/dequeue';

// ── Step functions ────────────────────────────────────────────────────────────

async function fetchPipeline(pipelineId: string) {
  const pipeline = await dbGetPipelineById(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);
  return pipeline;
}

function runAction(
  pipeline: { actionType: string; actionConfig: unknown },
  payload: Record<string, unknown>
) {
  return executeAction(
    pipeline.actionType,
    payload,
    pipeline.actionConfig as Record<string, unknown>
  );
}

async function spawnDeliveries(
  jobId: string,
  pipelineId: string,
  result: Record<string, unknown>
) {
  // Filtered jobs are completed but get no deliveries
  if (result.filtered === true) {
    console.log(`[processor] Job ${jobId} filtered — skipping delivery`);
    return;
  }

  const subscribers = await dbGetSubscribersByPipelineId(pipelineId);
  if (subscribers.length === 0) {
    console.log(`[processor] Job ${jobId} has no subscribers`);
    return;
  }

  await dbCreateDeliveryAttempts(jobId, subscribers.map((s) => s.url));
  console.log(`[processor] Job ${jobId} → ${subscribers.length} delivery attempt(s) queued`);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function processJob(job: ClaimedJob) {
  console.log(`[processor] Processing job ${job.id}`);
  try {
    const pipeline = await fetchPipeline(job.pipeline_id);
    const result = runAction(pipeline, job.payload);
    await dbMarkJobCompleted(job.id, result);
    await spawnDeliveries(job.id, job.pipeline_id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await dbMarkJobFailed(job.id, message);
    console.error(`[processor] Job ${job.id} failed: ${message}`);
  }
}