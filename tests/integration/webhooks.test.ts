import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, setupTestApp, teardownTestApp } from '../helpers/app';

let app: FastifyInstance;

beforeAll(async () => { app = await setupTestApp(); });
afterAll(async () => { await teardownTestApp(app); });
beforeEach(async () => { await cleanDatabase(); });

async function createTestPipeline() {
  const res = await app.inject({
    method: 'POST',
    url: '/pipelines',
    payload: {
      name: 'Webhook Test',
      actionType: 'json_transform',
      actionConfig: { id: 'user.id' },
      subscribers: ['https://example.com/hook'],
    },
  });
  return res.json();
}

describe('POST /webhooks/:token', () => {
  it('returns 202 and creates a pending job', async () => {
    const pipeline = await createTestPipeline();

    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: { user: { id: 1 } },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json().jobId).toBeDefined();
  });

  it('returns a valid UUID as jobId', async () => {
    const pipeline = await createTestPipeline();

    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: { user: { id: 1 } },
    });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(res.json().jobId).toMatch(uuidRegex);
  });

  it('returns a confirmation message', async () => {
    const pipeline = await createTestPipeline();

    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: { user: { id: 1 } },
    });

    expect(res.json().message).toBeDefined();
    expect(typeof res.json().message).toBe('string');
  });

  it('accepts an empty payload object', async () => {
    const pipeline = await createTestPipeline();

    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: {},
    });

    expect(res.statusCode).toBe(202);
  });

  it('creates a different job for each webhook call', async () => {
    const pipeline = await createTestPipeline();

    const res1 = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: { event: 'first' },
    });
    const res2 = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: { event: 'second' },
    });

    expect(res1.json().jobId).not.toBe(res2.json().jobId);
  });

  it('returns 404 for an unknown token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/00000000-0000-0000-0000-000000000000',
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(404);
  });
});