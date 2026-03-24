import 'dotenv/config';
import { config } from '../config';
import { pool } from '../db/client';
import { dequeueJobs } from '../queue/dequeue';
import { processDeliveries } from './delivery';
import { processJob } from './processor';



function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}



async function tick() {
  // 1. Claim and process pending jobs
  const jobs = await dequeueJobs(5);
  for (const job of jobs) {
    await processJob(job);
  }

  // 2. Attempt pending deliveries (including retries that are now due)
  await processDeliveries();
}


async function startWorker() {
  console.log(`🔧 Worker started — polling every ${config.WORKER_POLL_INTERVAL}ms`);

  let running = true;

  process.on('SIGTERM', () => {
    console.log('[worker] SIGTERM — shutting down after current tick');
    running = false;
  });
  process.on('SIGINT', () => {
    console.log('[worker] SIGINT — shutting down after current tick');
    running = false;
  });

  while (running) {
    try {
      await tick();
    } catch (err) {
      // Log but never crash the loop — a single bad tick shouldn't kill the worker
      console.error('[worker] Unexpected error in tick:', err);
    }
    await sleep(config.WORKER_POLL_INTERVAL);
  }

  await pool.end();
  console.log('[worker] Shutdown complete');
  process.exit(0);
}

startWorker();