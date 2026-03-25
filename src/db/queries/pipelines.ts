import { eq } from 'drizzle-orm';
import { db } from '../client';
import { Pipeline, pipelines, pipelineSubscribers } from '../schema';

export async function dbGetAllPipelines() {
  return db.select().from(pipelines).orderBy(pipelines.createdAt);
}

export async function dbGetPipelineById(id: string): Promise<Pipeline | null> {
  const rows = await db.select().from(pipelines).where(eq(pipelines.id, id));
  return rows[0] ?? null;
}

export async function dbGetSubscribersByPipelineId(pipelineId: string) {
  return db
    .select()
    .from(pipelineSubscribers)
    .where(eq(pipelineSubscribers.pipelineId, pipelineId));
}

export async function dbCreatePipeline(data: {
  name: string;
  actionType: string;
  actionConfig: Record<string, unknown>;
}) {
  const rows = await db.insert(pipelines).values(data).returning();
  return rows[0];
}

export async function dbCreateSubscribers(pipelineId: string, urls: string[]) {
  if (urls.length === 0) return [];
  return db
    .insert(pipelineSubscribers)
    .values(urls.map((url) => ({ pipelineId, url })))
    .returning();
}

export async function dbUpdatePipeline(
  id: string,
  data: {
    name?: string;
    actionType?: string;
    actionConfig?: Record<string, unknown>;
  }
) {
  const rows = await db
    .update(pipelines)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pipelines.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function dbDeletePipeline(id: string) {
  const rows = await db
    .delete(pipelines)
    .where(eq(pipelines.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function dbDeleteSubscribersByPipelineId(pipelineId: string) {
  await db
    .delete(pipelineSubscribers)
    .where(eq(pipelineSubscribers.pipelineId, pipelineId));
}
