import { eq } from 'drizzle-orm';
import { db } from '../client';
import { pipelines } from '../schema';

export async function dbGetPipelineBySourceToken(token: string) {
  const rows = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.sourceToken, token));
  return rows[0] ?? null;
}