import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config/config.js';
import { createDatabasePool, createKronosPool } from './config/db.js';
import { createKronosAuth } from './services/kronosAuth.js';
import { startRuntime } from './runtime.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

async function main() {
  const config = loadConfig();
  const db = createDatabasePool(config.database);
  const kronosDb = createKronosPool(config.kronosDatabase);
  const closeResources = async () => {
    const results = await Promise.allSettled([db.end(), kronosDb.end()]);
    if (results.some((result) => result.status === 'rejected')) throw new Error('Database pool cleanup failed.');
  };
  try {
    const auth = createKronosAuth(kronosDb, config.encryption);
    const app = createApp({ ...config, db, kronosDb, auth });
    await startRuntime({ app, port: config.port, closeResources });
  } catch (error) {
    await closeResources();
    if (error.code === 'EADDRINUSE') {
      throw new Error(`PORT ${config.port} is already in use. Set an unused OMS port in .env (default: 6103).`);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('Failed to start SiBS OMS API:', error.message);
  process.exitCode = 1;
});
