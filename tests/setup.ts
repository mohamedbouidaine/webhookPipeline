// Must be set before src/config.ts loads
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5433/webhook_pipeline_test';
process.env.PORT = '3001';
process.env.WORKER_POLL_INTERVAL = '1000';
process.env.MAX_DELIVERY_ATTEMPTS = '3';