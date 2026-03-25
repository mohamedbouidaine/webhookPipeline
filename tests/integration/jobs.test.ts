import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, setupTestApp, teardownTestApp } from '../helpers/app';

let app: FastifyInstance;

beforeAll(async () => { app = await setupTestApp(); });
afterAll(async () => { await teardownTestApp(app); });
beforeEach(async () => { await cleanDatabase(); });

// Both pipeline creation and webhook ingestion are synchronous DB inserts,
// so no polling or retries are needed here.
async function createJobViaWebhook(pipelineName = `Job Test ${Date.now()}`) {
  const pipelineRes = await app.inject({
    method: 'POST',
    url: '/pipelines',
    payload: {
      name: pipelineName,
      actionType: 'json_transform',
      actionConfig: { id: 'user.id' },
      subscribers: ['https://example.com/hook'],
    },
  });
  expect(pipelineRes.statusCode).toBe(201);
  const pipeline = pipelineRes.json();

  const webhookRes = await app.inject({
    method: 'POST',
    url: `/webhooks/${pipeline.sourceToken}`,
    payload: { user: { id: 99 } },
  });
  expect(webhookRes.statusCode).toBe(202);

  return { pipeline, jobId: webhookRes.json().jobId as string };
}

describe('GET /jobs', () => {
  it('returns all jobs', async () => {
    const { jobId } = await createJobViaWebhook();
    const res = await app.inject({ method: 'GET', url: '/jobs' });
    expect(res.statusCode).toBe(200);
    const jobs = res.json();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.some((job: { id: string }) => job.id === jobId)).toBe(true);
  });

  it('returns an empty array when there are no jobs', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('filters jobs by status=pending', async () => {
    const { jobId } = await createJobViaWebhook();
    const res = await app.inject({ method: 'GET', url: '/jobs?status=pending' });
    expect(res.statusCode).toBe(200);
    const jobs = res.json();
    expect(jobs.some((job: { id: string; status: string }) => job.id === jobId && job.status === 'pending')).toBe(true);
  });

  it('filters jobs by pipeline_id', async () => {
    const { pipeline, jobId } = await createJobViaWebhook('Pipeline A');
    await createJobViaWebhook('Pipeline B'); // second pipeline, different id

    const res = await app.inject({
      method: 'GET',
      url: `/jobs?pipeline_id=${pipeline.id}`,
    });
    expect(res.statusCode).toBe(200);
    const jobs = res.json();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(jobId);
  });

  it('returns 400 for an invalid status filter value', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs?status=invalid_status' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid pipeline_id format', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs?pipeline_id=not-a-uuid' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /jobs/:id', () => {
  it('returns the job with all expected fields', async () => {
    const { jobId, pipeline } = await createJobViaWebhook();
    const res = await app.inject({ method: 'GET', url: `/jobs/${jobId}` });
    expect(res.statusCode).toBe(200);
    const job = res.json();
    expect(job.id).toBe(jobId);
    expect(job.pipelineId).toBe(pipeline.id);
    expect(job.status).toBe('pending');
    expect(job.payload).toBeDefined();
    expect(job.createdAt).toBeDefined();
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /jobs/:id/deliveries', () => {
  it('returns empty array for a brand-new job (not yet processed by worker)', async () => {
    const { jobId } = await createJobViaWebhook();
    const res = await app.inject({ method: 'GET', url: `/jobs/${jobId}/deliveries` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 404 when the job does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/jobs/00000000-0000-0000-0000-000000000000/deliveries',
    });
    expect(res.statusCode).toBe(404);
  });
});