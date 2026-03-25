import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { deliveryAttempts, jobs } from '../schema';
import { Job } from '../schema';

export async function dbGetAllJobs(filters: {
  pipelineId?: string;
  status?: string;
}) {
  return db
    .select()
    .from(jobs)
    .where(
      and(
        filters.pipelineId ? eq(jobs.pipelineId, filters.pipelineId) : undefined,
        filters.status ? eq(jobs.status, filters.status) : undefined
      )
    )
    .orderBy(jobs.createdAt);
}

export async function dbGetJobById(id: string): Promise<Job | null> {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id));
  return rows[0] ?? null;
}

export async function dbGetDeliveriesByJobId(jobId: string) {
  return db
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.jobId, jobId))
    .orderBy(deliveryAttempts.createdAt);
}
export async function dbMarkJobCompleted(
  id: string,
  result: Record<string, unknown>
) {
  const rows = await db
    .update(jobs)
    .set({ status: 'completed', result, updatedAt: new Date(), completedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning();
  return rows[0];
}

export async function dbMarkJobFailed(id: string, error: string) {
  const rows = await db
    .update(jobs)
    .set({ status: 'failed', error, updatedAt: new Date(), completedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning();
  return rows[0];
}