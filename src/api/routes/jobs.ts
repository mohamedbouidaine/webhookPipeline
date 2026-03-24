import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  dbGetAllJobs,
  dbGetDeliveriesByJobId,
  dbGetJobById,
} from '../../db/queries/jobs';

// ── Validation schemas ────────────────────────────────────────────────────────

const ListJobsQuerySchema = z.object({
  pipeline_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

// ── Handler functions ─────────────────────────────────────────────────────────

async function handleListJobs(request: FastifyRequest, reply: FastifyReply) {
  const parsed = ListJobsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
  }

  const all = await dbGetAllJobs({
    pipelineId: parsed.data.pipeline_id,
    status: parsed.data.status,
  });

  return reply.status(200).send(all);
}

async function handleGetJob(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const job = await dbGetJobById(request.params.id);
  if (!job) {
    return reply.status(404).send({ error: 'Not Found', message: 'Job not found' });
  }
  return reply.status(200).send(job);
}

async function handleGetJobDeliveries(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  // Verify the job exists first
  const job = await dbGetJobById(request.params.id);
  if (!job) {
    return reply.status(404).send({ error: 'Not Found', message: 'Job not found' });
  }

  const deliveries = await dbGetDeliveriesByJobId(request.params.id);
  return reply.status(200).send(deliveries);
}

// ── Route registration ────────────────────────────────────────────────────────

export async function jobRoutes(app: FastifyInstance) {
  app.get('/jobs', handleListJobs);
  app.get('/jobs/:id', handleGetJob);
  app.get('/jobs/:id/deliveries', handleGetJobDeliveries);
}