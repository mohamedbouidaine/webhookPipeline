import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/server';
import { pool } from '../../src/db/client';

export async function setupTestApp(): Promise<FastifyInstance> {
  const app = buildApp();
  await app.ready();
  return app;
}

export async function teardownTestApp(app: FastifyInstance) {
  await app.close();
  await pool.end();
}

export async function cleanDatabase() {
  await pool.query('DELETE FROM delivery_attempts');
  await pool.query('DELETE FROM jobs');
  await pool.query('DELETE FROM pipeline_subscribers');
  await pool.query('DELETE FROM pipelines');
}