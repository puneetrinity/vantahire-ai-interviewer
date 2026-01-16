import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createNodeWebSocket } from '@hono/node-ws';

import { config } from './lib/config.js';
import { db } from './lib/db.js';
import { redis } from './lib/redis.js';
import type { AppEnv } from './types/index.js';

// Routes
import authRoutes from './routes/auth.js';
import applicationsRoutes from './routes/applications.js';
import filesRoutes from './routes/files.js';
import interviewsRoutes from './routes/interviews.js';
import jobsRoutes from './routes/jobs.js';
import usersRoutes from './routes/users.js';
import webhooksRoutes from './routes/webhooks.js';
import { apiKeysRoutes } from './routes/api-keys.js';

const app = new Hono<AppEnv>();

// WebSocket setup for voice interviews
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
  })
);

// Health check
app.get('/health', async (c) => {
  try {
    // Check database
    await db.$queryRaw`SELECT 1`;
    // Check Redis
    await redis.ping();

    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    return c.json(
      { status: 'unhealthy', error: String(error) },
      500
    );
  }
});

// API routes
app.route('/auth', authRoutes);
app.route('/applications', applicationsRoutes);
app.route('/files', filesRoutes);
app.route('/interviews', interviewsRoutes);
app.route('/jobs', jobsRoutes);
app.route('/users', usersRoutes);
app.route('/webhooks', webhooksRoutes);
app.route('/api-keys', apiKeysRoutes);

// Voice WebSocket route - requires interview token auth
app.get(
  '/voice/:interviewId',
  async (c, next) => {
    const interviewId = c.req.param('interviewId');
    const token = c.req.header('X-Interview-Token') || c.req.query('token');

    if (!token) {
      return c.json({ error: 'Interview token required' }, 401);
    }

    // Validate token matches the interview
    const session = await db.interviewSession.findFirst({
      where: {
        token,
        interviewId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { interview: true },
    });

    if (!session) {
      return c.json({ error: 'Invalid or expired interview token' }, 401);
    }

    // Store validated session for handler (matches InterviewSession type)
    c.set('interviewSession', {
      sessionId: session.id,
      interviewId: session.interviewId,
      interview: session.interview,
      token,
    });
    return next();
  },
  upgradeWebSocket(async (c) => {
    const interviewId = c.req.param('interviewId');
    // Import dynamically to avoid circular deps
    const { createVoiceHandler } = await import('./services/voice/handler.js');
    return createVoiceHandler(interviewId);
  })
);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: config.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
    500
  );
});

export { app, injectWebSocket };
export default app;
