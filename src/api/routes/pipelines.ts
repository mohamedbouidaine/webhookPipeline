import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  dbCreatePipeline,
  dbCreateSubscribers,
  dbDeletePipeline,
  dbDeleteSubscribersByPipelineId,
  dbGetAllPipelines,
  dbGetPipelineById,
  dbGetSubscribersByPipelineId,
  dbUpdatePipeline,
} from '../../db/queries/pipelines';

// ── Validation schemas ────────────────────────────────────────────────────────

const CreatePipelineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  actionType: z.enum(['json_transform', 'conditional_filter', 'text_template']),
  actionConfig: z.record(z.unknown()).default({}),
  subscribers: z
    .array(z.string().url('Each subscriber must be a valid URL'))
    .min(1, 'At least one subscriber URL is required'),
});

const UpdatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  actionType: z.enum(['json_transform', 'conditional_filter', 'text_template']).optional(),
  actionConfig: z.record(z.unknown()).optional(),
  subscribers: z.array(z.string().url()).optional(),
});

// ── Handler functions ─────────────────────────────────────────────────────────

async function handleListPipelines(_request: FastifyRequest, reply: FastifyReply) {
  const all = await dbGetAllPipelines();
  return reply.status(200).send(all);
}

async function handleGetPipeline(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const pipeline = await dbGetPipelineById(request.params.id);
  if (!pipeline) {
    return reply.status(404).send({ error: 'Not Found', message: 'Pipeline not found' });
  }
  const subscribers = await dbGetSubscribersByPipelineId(pipeline.id);
  return reply.status(200).send({ ...pipeline, subscribers });
}

async function handleCreatePipeline(request: FastifyRequest, reply: FastifyReply) {
  const parsed = CreatePipelineSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
  }

  const { name, actionType, actionConfig, subscribers } = parsed.data;
  const pipeline = await dbCreatePipeline({ name, actionType, actionConfig });
  const created = await dbCreateSubscribers(pipeline.id, subscribers);

  return reply.status(201).send({ ...pipeline, subscribers: created });
}

async function handleUpdatePipeline(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const parsed = UpdatePipelineSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
  }

  const { subscribers, ...fields } = parsed.data;

  const pipeline = await dbUpdatePipeline(request.params.id, fields);
  if (!pipeline) {
    return reply.status(404).send({ error: 'Not Found', message: 'Pipeline not found' });
  }

  // If subscribers were provided, replace them entirely
  if (subscribers !== undefined) {
    await dbDeleteSubscribersByPipelineId(pipeline.id);
    await dbCreateSubscribers(pipeline.id, subscribers);
  }

  const updatedSubscribers = await dbGetSubscribersByPipelineId(pipeline.id);
  return reply.status(200).send({ ...pipeline, subscribers: updatedSubscribers });
}

async function handleDeletePipeline(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const deleted = await dbDeletePipeline(request.params.id);
  if (!deleted) {
    return reply.status(404).send({ error: 'Not Found', message: 'Pipeline not found' });
  }
  return reply.status(204).send();
}

// ── Route registration ────────────────────────────────────────────────────────

export async function pipelineRoutes(app: FastifyInstance) {
  app.get('/pipelines', handleListPipelines);
  app.get('/pipelines/:id', handleGetPipeline);
  app.post('/pipelines', handleCreatePipeline);
  app.put('/pipelines/:id', handleUpdatePipeline);
  app.delete('/pipelines/:id', handleDeletePipeline);
}
