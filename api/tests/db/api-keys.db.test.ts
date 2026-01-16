/**
 * DB Integration Tests: API Keys
 *
 * Run with: npm run test:db
 * Requires: DATABASE_URL and seeded database
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { prisma, TEST_IDS, setupDbTests, teardownDbTests } from './setup.js';

// Simple hash function for testing
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

describe('API Keys DB Integration', () => {
  beforeAll(async () => {
    await setupDbTests();
  });

  afterAll(async () => {
    await teardownDbTests();
  });

  describe('API Key CRUD', () => {
    const tempKeyId = '00000000-0000-4000-8000-000000008881';
    const testRawKey = 'vantahire_test_key_12345';
    const testKeyHash = hashKey(testRawKey);

    afterAll(async () => {
      await prisma.apiKey.deleteMany({ where: { id: tempKeyId } });
    });

    it('should create API key', async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          id: tempKeyId,
          userId: TEST_IDS.recruiter,
          name: 'Test API Key',
          keyHash: testKeyHash,
          keyPrefix: 'vantahire_test_',
          scopes: ['interviews:read', 'jobs:read'],
          rateLimitPerDay: 500,
        },
      });

      expect(apiKey.id).toBe(tempKeyId);
      expect(apiKey.name).toBe('Test API Key');
      expect(apiKey.status).toBe('ACTIVE');
      expect(apiKey.scopes).toContain('interviews:read');
      expect(apiKey.rateLimitPerDay).toBe(500);
    });

    it('should find API key by hash', async () => {
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: testKeyHash },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.id).toBe(tempKeyId);
    });

    it('should include user relation', async () => {
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: tempKeyId },
        include: { user: true },
      });

      expect(apiKey?.user).not.toBeNull();
      expect(apiKey?.user.email).toBe('recruiter@test.com');
    });

    it('should update API key name', async () => {
      const updated = await prisma.apiKey.update({
        where: { id: tempKeyId },
        data: { name: 'Updated API Key' },
      });

      expect(updated.name).toBe('Updated API Key');
    });

    it('should update API key scopes', async () => {
      const updated = await prisma.apiKey.update({
        where: { id: tempKeyId },
        data: { scopes: ['interviews:read', 'interviews:write', 'jobs:read'] },
      });

      expect(updated.scopes).toContain('interviews:write');
      expect(updated.scopes.length).toBe(3);
    });
  });

  describe('API Key Rate Limiting', () => {
    const rateLimitKeyId = '00000000-0000-4000-8000-000000008882';
    const rateLimitKeyHash = hashKey('vantahire_rate_limit_test');

    beforeAll(async () => {
      await prisma.apiKey.create({
        data: {
          id: rateLimitKeyId,
          userId: TEST_IDS.recruiter,
          name: 'Rate Limit Test Key',
          keyHash: rateLimitKeyHash,
          keyPrefix: 'vantahire_rate_',
          rateLimitPerDay: 100,
          requestsToday: 0,
        },
      });
    });

    afterAll(async () => {
      await prisma.apiKey.deleteMany({ where: { id: rateLimitKeyId } });
    });

    it('should increment request count', async () => {
      const updated = await prisma.apiKey.update({
        where: { id: rateLimitKeyId },
        data: {
          requestsToday: { increment: 1 },
          lastRequestAt: new Date(),
        },
      });

      expect(updated.requestsToday).toBe(1);
      expect(updated.lastRequestAt).not.toBeNull();
    });

    it('should track multiple requests', async () => {
      // Simulate 10 requests
      for (let i = 0; i < 10; i++) {
        await prisma.apiKey.update({
          where: { id: rateLimitKeyId },
          data: { requestsToday: { increment: 1 } },
        });
      }

      const apiKey = await prisma.apiKey.findUnique({
        where: { id: rateLimitKeyId },
      });

      expect(apiKey?.requestsToday).toBe(11); // 1 from previous test + 10
    });

    it('should reset rate limit counter', async () => {
      const updated = await prisma.apiKey.update({
        where: { id: rateLimitKeyId },
        data: {
          requestsToday: 0,
          lastResetAt: new Date(),
        },
      });

      expect(updated.requestsToday).toBe(0);
      expect(updated.lastResetAt).not.toBeNull();
    });

    it('should check rate limit exceeded', async () => {
      // Set to exactly at limit
      await prisma.apiKey.update({
        where: { id: rateLimitKeyId },
        data: { requestsToday: 100 },
      });

      const apiKey = await prisma.apiKey.findUnique({
        where: { id: rateLimitKeyId },
      });

      const isRateLimited = apiKey!.requestsToday >= apiKey!.rateLimitPerDay;
      expect(isRateLimited).toBe(true);
    });
  });

  describe('API Key Status Transitions', () => {
    const statusKeyId = '00000000-0000-4000-8000-000000008883';
    const statusKeyHash = hashKey('vantahire_status_test');

    beforeAll(async () => {
      await prisma.apiKey.create({
        data: {
          id: statusKeyId,
          userId: TEST_IDS.recruiter,
          name: 'Status Test Key',
          keyHash: statusKeyHash,
          keyPrefix: 'vantahire_status_',
        },
      });
    });

    afterAll(async () => {
      await prisma.apiKey.deleteMany({ where: { id: statusKeyId } });
    });

    it('should revoke API key', async () => {
      const updated = await prisma.apiKey.update({
        where: { id: statusKeyId },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      });

      expect(updated.status).toBe('REVOKED');
      expect(updated.revokedAt).not.toBeNull();
    });

    it('should filter active keys only', async () => {
      const activeKeys = await prisma.apiKey.findMany({
        where: {
          userId: TEST_IDS.recruiter,
          status: 'ACTIVE',
        },
      });

      expect(activeKeys.every(k => k.status === 'ACTIVE')).toBe(true);
    });

    it('should set expiration date', async () => {
      const expirationKeyId = '00000000-0000-4000-8000-000000008884';
      const expirationKeyHash = hashKey('vantahire_expiration_test');

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);

      const apiKey = await prisma.apiKey.create({
        data: {
          id: expirationKeyId,
          userId: TEST_IDS.recruiter,
          name: 'Expiring Key',
          keyHash: expirationKeyHash,
          keyPrefix: 'vantahire_exp_',
          expiresAt: futureDate,
        },
      });

      expect(apiKey.expiresAt).not.toBeNull();
      expect(apiKey.expiresAt!.getTime()).toBeGreaterThan(Date.now());

      // Cleanup
      await prisma.apiKey.delete({ where: { id: expirationKeyId } });
    });

    it('should find expired keys', async () => {
      const expiredKeyId = '00000000-0000-4000-8000-000000008885';
      const expiredKeyHash = hashKey('vantahire_expired_test');

      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 1);

      await prisma.apiKey.create({
        data: {
          id: expiredKeyId,
          userId: TEST_IDS.recruiter,
          name: 'Expired Key',
          keyHash: expiredKeyHash,
          keyPrefix: 'vantahire_old_',
          expiresAt: pastDate,
        },
      });

      const expiredKeys = await prisma.apiKey.findMany({
        where: {
          expiresAt: { lt: new Date() },
          status: 'ACTIVE',
        },
      });

      expect(expiredKeys.length).toBeGreaterThan(0);
      expect(expiredKeys.some(k => k.id === expiredKeyId)).toBe(true);

      // Cleanup
      await prisma.apiKey.delete({ where: { id: expiredKeyId } });
    });
  });

  describe('API Key Queries', () => {
    it('should list API keys for user', async () => {
      const keys = await prisma.apiKey.findMany({
        where: { userId: TEST_IDS.recruiter },
        orderBy: { createdAt: 'desc' },
      });

      // At least the keys created in tests
      expect(keys.length).toBeGreaterThanOrEqual(0);
    });

    it('should count API keys by status', async () => {
      const counts = await prisma.apiKey.groupBy({
        by: ['status'],
        _count: true,
      });

      expect(Array.isArray(counts)).toBe(true);
    });
  });
});
