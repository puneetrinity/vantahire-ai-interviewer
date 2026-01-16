import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

// Session helpers
const SESSION_PREFIX = 'session:';

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  createdAt: number;
}

export async function createSession(
  sessionId: string,
  data: SessionData
): Promise<void> {
  await redis.setex(
    `${SESSION_PREFIX}${sessionId}`,
    config.SESSION_TTL_SECONDS,
    JSON.stringify(data)
  );
}

export async function getSession(
  sessionId: string
): Promise<SessionData | null> {
  const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  if (!data) return null;
  return JSON.parse(data) as SessionData;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
}

export async function refreshSession(sessionId: string): Promise<boolean> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const exists = await redis.exists(key);
  if (!exists) return false;
  await redis.expire(key, config.SESSION_TTL_SECONDS);
  return true;
}
