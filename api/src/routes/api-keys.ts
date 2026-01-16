import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { AppEnv, AuthUser } from '../types/index.js';
import { createHash, randomBytes } from 'crypto';

const app = new Hono<AppEnv>();

// Generate a secure API key
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `vh_${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 10);
  return { key, hash, prefix };
}

// Hash an API key for comparison
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ─────────────────────────────────────────────────────────────
// List API keys for current user
// ─────────────────────────────────────────────────────────────
app.get('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;

  const keys = await db.apiKey.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      rateLimitPerDay: true,
      requestsToday: true,
      lastRequestAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json({ data: keys });
});

// ─────────────────────────────────────────────────────────────
// Create a new API key
// ─────────────────────────────────────────────────────────────
app.post('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();

  const { name, scopes = [], expiresAt, rateLimitPerDay = 1000 } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return c.json({ error: 'Name is required' }, 400);
  }

  // Generate the key
  const { key, hash, prefix } = generateApiKey();

  // Parse expiration if provided
  let expiration: Date | null = null;
  if (expiresAt) {
    expiration = new Date(expiresAt);
    if (isNaN(expiration.getTime())) {
      return c.json({ error: 'Invalid expiresAt date' }, 400);
    }
  }

  const apiKey = await db.apiKey.create({
    data: {
      userId: user.id,
      name: name.trim(),
      keyHash: hash,
      keyPrefix: prefix,
      scopes: Array.isArray(scopes) ? scopes : [],
      expiresAt: expiration,
      rateLimitPerDay,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      status: true,
      expiresAt: true,
      rateLimitPerDay: true,
      createdAt: true,
    },
  });

  // Return the full key ONLY on creation (never stored, only hash is stored)
  return c.json({
    ...apiKey,
    key, // This is the only time the full key is returned
    message: 'Store this key securely. It will not be shown again.',
  }, 201);
});

// ─────────────────────────────────────────────────────────────
// Get a specific API key
// ─────────────────────────────────────────────────────────────
app.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const apiKey = await db.apiKey.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      rateLimitPerDay: true,
      requestsToday: true,
      lastResetAt: true,
      lastRequestAt: true,
      createdAt: true,
      _count: {
        select: { usageLogs: true },
      },
    },
  });

  if (!apiKey) {
    return c.json({ error: 'API key not found' }, 404);
  }

  // Only owner or admin can view
  if (apiKey.userId !== user.id && user.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return c.json(apiKey);
});

// ─────────────────────────────────────────────────────────────
// Update API key (name, scopes, rate limit)
// ─────────────────────────────────────────────────────────────
app.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db.apiKey.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });

  if (!existing) {
    return c.json({ error: 'API key not found' }, 404);
  }

  if (existing.userId !== user.id && user.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (existing.status === 'REVOKED') {
    return c.json({ error: 'Cannot update a revoked key' }, 400);
  }

  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    updateData.name = body.name.trim();
  }

  if (body.scopes !== undefined) {
    if (!Array.isArray(body.scopes)) {
      return c.json({ error: 'Scopes must be an array' }, 400);
    }
    updateData.scopes = body.scopes;
  }

  if (body.rateLimitPerDay !== undefined) {
    if (typeof body.rateLimitPerDay !== 'number' || body.rateLimitPerDay < 1) {
      return c.json({ error: 'Invalid rate limit' }, 400);
    }
    updateData.rateLimitPerDay = body.rateLimitPerDay;
  }

  const updated = await db.apiKey.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      status: true,
      expiresAt: true,
      rateLimitPerDay: true,
      createdAt: true,
    },
  });

  return c.json(updated);
});

// ─────────────────────────────────────────────────────────────
// Revoke an API key
// ─────────────────────────────────────────────────────────────
app.post('/:id/revoke', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const existing = await db.apiKey.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });

  if (!existing) {
    return c.json({ error: 'API key not found' }, 404);
  }

  if (existing.userId !== user.id && user.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (existing.status === 'REVOKED') {
    return c.json({ error: 'Key already revoked' }, 400);
  }

  const revoked = await db.apiKey.update({
    where: { id },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      status: true,
      revokedAt: true,
    },
  });

  return c.json(revoked);
});

// ─────────────────────────────────────────────────────────────
// Delete an API key (permanent)
// ─────────────────────────────────────────────────────────────
app.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const existing = await db.apiKey.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!existing) {
    return c.json({ error: 'API key not found' }, 404);
  }

  if (existing.userId !== user.id && user.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Delete usage logs first (cascade not automatic for this relation)
  await db.apiUsageLog.deleteMany({ where: { apiKeyId: id } });
  await db.apiKey.delete({ where: { id } });

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Get usage logs for an API key
// ─────────────────────────────────────────────────────────────
app.get('/:id/usage', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const id = c.req.param('id');

  const existing = await db.apiKey.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!existing) {
    return c.json({ error: 'API key not found' }, 404);
  }

  if (existing.userId !== user.id && user.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    db.apiUsageLog.findMany({
      where: { apiKeyId: id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.apiUsageLog.count({ where: { apiKeyId: id } }),
  ]);

  return c.json({
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─────────────────────────────────────────────────────────────
// Validate API key (for external verification)
// ─────────────────────────────────────────────────────────────
app.post('/validate', async (c) => {
  const body = await c.req.json();
  const { key } = body;

  if (!key || typeof key !== 'string') {
    return c.json({ valid: false, error: 'Key required' }, 400);
  }

  const hash = hashApiKey(key);

  const apiKey = await db.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      scopes: true,
      rateLimitPerDay: true,
      requestsToday: true,
    },
  });

  if (!apiKey) {
    return c.json({ valid: false, error: 'Invalid key' });
  }

  if (apiKey.status === 'REVOKED' || apiKey.revokedAt) {
    return c.json({ valid: false, error: 'Key revoked' });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return c.json({ valid: false, error: 'Key expired' });
  }

  if (apiKey.requestsToday >= apiKey.rateLimitPerDay) {
    return c.json({ valid: false, error: 'Rate limit exceeded' });
  }

  return c.json({
    valid: true,
    userId: apiKey.userId,
    scopes: apiKey.scopes,
    remainingRequests: apiKey.rateLimitPerDay - apiKey.requestsToday,
  });
});

// ─────────────────────────────────────────────────────────────
// Admin: List all API keys
// ─────────────────────────────────────────────────────────────
app.get('/admin/all', requireAuth, requireRole('ADMIN'), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const skip = (page - 1) * limit;
  const status = c.req.query('status');

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  }

  const [keys, total] = await Promise.all([
    db.apiKey.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.apiKey.count({ where }),
  ]);

  // Remove sensitive fields
  const sanitized = keys.map(({ keyHash, ...rest }) => rest);

  return c.json({
    data: sanitized,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export { app as apiKeysRoutes };
