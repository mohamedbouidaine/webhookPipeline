import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import { config } from '../config';
import { errorHandler } from './middleware/error-handler';
import { jobRoutes } from './routes/jobs';
import { pipelineRoutes } from './routes/pipelines';
import { webhookRoutes } from './routes/webhooks';

function getHealthStatus() {
  return { status: 'ok', timestamp: new Date().toISOString() };
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.setErrorHandler(errorHandler);

  app.get('/health', async (_request, reply) => {
    return reply.status(200).send(getHealthStatus());
  });

  app.register(pipelineRoutes);
  app.register(webhookRoutes);
  app.register(jobRoutes);

  return app;
}

async function start() {
  const app = buildApp();
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`🚀 API server running on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();