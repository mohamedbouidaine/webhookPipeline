import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import { config } from '../config';

async function migrate() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const sql = readFileSync(resolve(__dirname, 'migrations', '0001_initial.sql'), 'utf-8');

  try {
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
