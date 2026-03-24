import { db } from '../db/client';
import { jobs } from '../db/schema';

export async function enqueueJob(
  pipelineId: string,
  payload: Record<string, unknown>
) {
  const rows = await db
    .insert(jobs)
    .values({ pipelineId, payload, status: 'pending' })
    .returning();
  return rows[0];
}