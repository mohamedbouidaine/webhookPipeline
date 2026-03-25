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

  it('response includes all expected pipeline fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/pipelines', payload: validBody });
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Test Pipeline');
    expect(body.actionType).toBe('json_transform');
    expect(body.actionConfig).toEqual({ userId: 'user.id' });
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
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

  it('returns 400 when a subscriber URL is not a valid URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: { ...validBody, subscribers: ['not-a-url'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when required name field is missing', async () => {
    const { name: _name, ...bodyWithoutName } = validBody;
    const res = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: bodyWithoutName,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when actionConfig is invalid for conditional_filter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: {
        ...validBody,
        actionType: 'conditional_filter',
        actionConfig: { conditions: [] }, // empty conditions — fails validation
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when actionConfig is invalid for text_template (missing template)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: {
        ...validBody,
        actionType: 'text_template',
        actionConfig: {}, // missing required template key
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts multiple subscriber URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pipelines',
      payload: {
        ...validBody,
        subscribers: ['https://a.example.com/hook', 'https://b.example.com/hook'],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().subscribers).toHaveLength(2);
  });
});

describe('GET /pipelines', () => {
  it('returns empty array when no pipelines exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/pipelines' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns all pipelines', async () => {
    await app.inject({ method: 'POST', url: '/pipelines', payload: validBody });
    const res = await app.inject({ method: 'GET', url: '/pipelines' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('returns multiple pipelines', async () => {
    await app.inject({ method: 'POST', url: '/pipelines', payload: validBody });
    await app.inject({ method: 'POST', url: '/pipelines', payload: { ...validBody, name: 'Pipeline 2' } });
    const res = await app.inject({ method: 'GET', url: '/pipelines' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });
});

describe('GET /pipelines/:id', () => {
  it('returns a pipeline with its subscribers', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({ method: 'GET', url: `/pipelines/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().subscribers).toHaveLength(1);
    expect(res.json().subscribers[0].url).toBe('https://example.com/hook');
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/pipelines/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /pipelines/:id', () => {
  it('updates the pipeline name and returns 200', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/pipelines/${created.id}`,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Updated Name');
  });

  it('replaces subscribers when provided', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/pipelines/${created.id}`,
      payload: { subscribers: ['https://new-hook.example.com/endpoint'] },
    });
    expect(res.statusCode).toBe(200);
    const subscribers = res.json().subscribers;
    expect(subscribers).toHaveLength(1);
    expect(subscribers[0].url).toBe('https://new-hook.example.com/endpoint');
  });

  it('keeps existing subscribers when not provided in update', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/pipelines/${created.id}`,
      payload: { name: 'Only Name Changed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().subscribers).toHaveLength(1);
  });

  it('returns 404 for unknown pipeline id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/pipelines/00000000-0000-0000-0000-000000000000',
      payload: { name: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when an updated subscriber URL is invalid', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/pipelines/${created.id}`,
      payload: { subscribers: ['not-a-valid-url'] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /pipelines/:id', () => {
  it('deletes a pipeline and returns 204', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    const res = await app.inject({ method: 'DELETE', url: `/pipelines/${created.id}` });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when deleting an already-deleted pipeline', async () => {
    const created = (await app.inject({ method: 'POST', url: '/pipelines', payload: validBody })).json();
    await app.inject({ method: 'DELETE', url: `/pipelines/${created.id}` });
    const res = await app.inject({ method: 'DELETE', url: `/pipelines/${created.id}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/pipelines/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});