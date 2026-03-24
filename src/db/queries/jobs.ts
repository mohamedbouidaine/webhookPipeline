import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { deliveryAttempts, jobs } from '../schema';

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

export async function dbGetJobById(id: string) {
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