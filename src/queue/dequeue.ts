import { pool } from '../db/client';

export type ClaimedJob = {
  id: string;
  pipeline_id: string;
  payload: Record<string, unknown>;
  created_at: Date;
};

export async function dequeueJobs(batchSize = 5): Promise<ClaimedJob[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomically select and lock pending jobs — SKIP LOCKED means other
    // workers running in parallel will skip rows already locked by this query
    const { rows } = await client.query<ClaimedJob>(
      `SELECT id, pipeline_id, payload, created_at
       FROM jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    if (rows.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    // Claim them — mark as processing before releasing the lock
    const ids = rows.map((r) => r.id);
    await client.query(
      `UPDATE jobs SET status = 'processing', updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}