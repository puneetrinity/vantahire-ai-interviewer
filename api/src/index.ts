import 'dotenv/config';
import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'http';

import app, { injectWebSocket } from './app.js';
import { config } from './lib/config.js';
import { db } from './lib/db.js';
import { redis } from './lib/redis.js';
import { initSocketIO } from './lib/socket.js';
import { startScheduledJobs } from './jobs/index.js';

// Start server
const server = serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
  }
);

// Inject WebSocket support
injectWebSocket(server);

// Initialize Socket.IO for real-time updates
initSocketIO(server as unknown as HttpServer);

// Start scheduled jobs
startScheduledJobs();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await db.$disconnect();
  redis.disconnect();
  process.exit(0);
});

export default app;
