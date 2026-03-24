import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, setupTestApp, teardownTestApp } from '../helpers/app';

let app: FastifyInstance;

beforeAll(async () => { app = await setupTestApp(); });
afterAll(async () => { await teardownTestApp(app); });
beforeEach(async () => { await cleanDatabase(); });

describe('POST /webhooks/:token', () => {
  it('returns 202 and creates a pending job', async () => {
    const pipeline = (
      await app.inject({
        method: 'POST',
        url: '/pipelines',
        payload: {
          name: 'Webhook Test',
          actionType: 'json_transform',
          actionConfig: { id: 'user.id' },
          subscribers: ['https://example.com/hook'],
        },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${pipeline.sourceToken}`,
      payload: { user: { id: 1 } },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json().jobId).toBeDefined();
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