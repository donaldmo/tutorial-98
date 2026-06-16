import 'dotenv/config';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { autoSeedAdmin, autoSeedSuperAdmin } from './utils/seedAdmin.js';
import { seedSystemJobTypes } from './utils/seedSystemJobTypes.js';
import { closeEmailQueue } from './jobs/emailQueue.js';
import { ensureBuiltInTemplatesAvailable } from './services/builtinTemplatesService.js';
import { ensureWorkingDayCalendarIndexes } from './utils/workingDayCalendarIndexes.js';

// ── Early-exit env validation ───────────────────────────────────────
const requiredVars = ['MONGO_URL', 'JWT_SECRET'];
for (const key of requiredVars) {
  if (!process.env[key]) {
    console.error(`[server] ❌  Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
if (process.env.NODE_ENV === 'production') {
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) {
    console.error('[server] ❌  CORS_ORIGINS must include at least one origin in production');
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT ?? 8080);
const seedAdminOnStartup =
  typeof process.env.SEED_ADMIN_ON_STARTUP === 'string'
    ? process.env.SEED_ADMIN_ON_STARTUP === 'true'
    : process.env.NODE_ENV !== 'production';

let server;

const start = async () => {
  await connectDatabase();
  await ensureWorkingDayCalendarIndexes().catch(() => null);
  await ensureBuiltInTemplatesAvailable({ log: true });
  if (seedAdminOnStartup) {
    await autoSeedAdmin();
  } else {
    console.log('[server] Admin auto-seed disabled on startup (SEED_ADMIN_ON_STARTUP=false).');
  }

  await autoSeedSuperAdmin();

  await seedSystemJobTypes();

  server = app.listen(PORT, () => {
    console.log(`Node server listening on port ${PORT}`);
  });
};

const shutdown = async (signal) => {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Shutting down...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await closeEmailQueue().catch(() => null);
  await disconnectDatabase();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', error);
  process.exit(1);
});
