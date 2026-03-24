import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, setupTestApp, teardownTestApp } from '../helpers/app';

let app: FastifyInstance;

beforeAll(async () => { app = await setupTestApp(); });
afterAll(async () => { await teardownTestApp(app); });
beforeEach(async () => { await cleanDatabase(); });

const validBody = {
  name: 'Test Pipeline',
  actionType: 'json_transform',
  actionConfig: { userId: 'user.id' },
  subscribers: ['https://example.com/hook'],
};

describe('POST /pipelines', () => {
  it('creates a pipeline and returns 201', async () => {
    const res = await app.inject({ method: 'POST', url: '/pipelines', payload: validBody });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Test Pipeline');
    expect(body.sourceToken).toBeDefined();
    expect(body.subscribers).toHaveLength(1);
  });

  it('returns 400 for invalid actionType', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: { ...validBody, actionType: 'unknown_type' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when subscribers array is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: { ...validBody, subscribers: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /pipelines', () => {
  it('returns all pipelines', async () => {
    await app.inject({ method: 'POST', url: '/pipelines', payload: validBody });
    const res = await app.inject({ method: 'GET', url: '/pipelines' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});

describe('GET /pipelines/:id', () => {
  it('returns a pipeline with its subscribers', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({ method: 'GET', url: `/pipelines/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().subscribers).toHaveLength(1);
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/pipelines/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /pipelines/:id', () => {
  it('deletes a pipeline and returns 204', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({ method: 'DELETE', url: `/pipelines/${created.id}` });
    expect(res.statusCode).toBe(204);
  });
});