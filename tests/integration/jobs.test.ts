import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, setupTestApp, teardownTestApp } from '../helpers/app';

let app: FastifyInstance;

beforeAll(async () => { app = await setupTestApp(); });
afterAll(async () => { await teardownTestApp(app); });
beforeEach(async () => { await cleanDatabase(); });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createJobViaWebhook() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const pipelineRes = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: {
        name: `Job Test ${Date.now()}-${attempt}`,
        actionType: 'json_transform',
        actionConfig: { id: 'user.id' },
        subscribers: ['https://example.com/hook'],
      },
    });

    if (pipelineRes.statusCode !== 201) {
      await sleep(20);
      continue;
    }

    const pipeline = pipelineRes.json();

    const webhookRes = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: { user: { id: 99 } },
    });

    if (webhookRes.statusCode === 202 && webhookRes.json().jobId) {
      const webhook = webhookRes.json();
      return { pipeline, jobId: webhook.jobId };
    }

    await sleep(20);
  }

  throw new Error('Failed to create job via webhook after retries');
}

async function fetchJobsUntilContains(url: string, jobId: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await app.inject({ method: 'GET', url });
    if (res.statusCode !== 200) {
      await sleep(20);
      continue;
    }

    const jobs = res.json();
    if (Array.isArray(jobs) && jobs.some((job) => job.id === jobId)) {
      return { res, jobs };
    }

    await sleep(20);
  }

  const finalRes = await app.inject({ method: 'GET', url });
  return { res: finalRes, jobs: finalRes.statusCode === 200 ? finalRes.json() : [] };
}

describe('GET /jobs', () => {
  it('returns all jobs', async () => {
    const { jobId } = await createJobViaWebhook();
    const { res, jobs } = await fetchJobsUntilContains('/jobs', jobId);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.some((job: { id: string; status: string }) => job.id === jobId)).toBe(true);
  });

  it('filters by status', async () => {
    const { jobId } = await createJobViaWebhook();
    const { res, jobs } = await fetchJobsUntilContains('/jobs?status=pending', jobId);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(jobs)).toBe(true);
    expect(
      jobs.some((job: { id: string; status: string }) => job.id === jobId && job.status === 'pending')
    ).toBe(true);
  });
});

describe('GET /jobs/:id', () => {
  it('returns the job', async () => {
    const { jobId } = await createJobViaWebhook();
    const res = await app.inject({ method: 'GET', url: `/jobs/${jobId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(jobId);
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /jobs/:id/deliveries', () => {
  it('returns empty array for a new job', async () => {
    const { jobId } = await createJobViaWebhook();
    const res = await app.inject({ method: 'GET', url: `/jobs/${jobId}/deliveries` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});