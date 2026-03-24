import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
): void {
  console.error(`[error] ${error.message}`);

  if (error.statusCode === 404) {
    reply.status(404).send({ error: 'Not Found', message: error.message });
    return;
  }

  if (error.statusCode === 400) {
    reply.status(400).send({ error: 'Bad Request', message: error.message });
    return;
  }

  reply.status(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}
