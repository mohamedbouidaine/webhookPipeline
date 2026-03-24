import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { dbGetPipelineBySourceToken } from '../../db/queries/webhooks';
import { enqueueJob } from '../../queue/enqueue';

// ── Handler functions ─────────────────────────────────────────────────────────

async function handleWebhookIngestion(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply
) {
  const pipeline = await dbGetPipelineBySourceToken(request.params.token);

  if (!pipeline) {
    return reply.status(404).send({
      error: 'Not Found',
      message: 'No pipeline found for this webhook URL',
    });
  }

  const payload = (request.body as Record<string, unknown>) ?? {};
  const job = await enqueueJob(pipeline.id, payload);

  return reply.status(202).send({
    message: 'Webhook received and queued for processing',
    jobId: job.id,
  });
}

// ── Route registration ────────────────────────────────────────────────────────

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/:token', handleWebhookIngestion);
}