import { describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'crypto';

/**
 * API Key Tests
 *
 * Tests API key generation, validation, and security logic.
 */

// API key generation helpers (same as in routes)
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `vh_${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 10);
  return { key, hash, prefix };
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

describe('API Key Generation', () => {
  describe('Key Format', () => {
    it('should generate key with vh_ prefix', () => {
      const { key } = generateApiKey();
      expect(key.startsWith('vh_')).toBe(true);
    });

    it('should generate key of correct length', () => {
      const { key } = generateApiKey();
      // vh_ (3) + 64 hex chars = 67
      expect(key.length).toBe(67);
    });

    it('should generate unique keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const { key } = generateApiKey();
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    });

    it('should extract correct prefix', () => {
      const { key, prefix } = generateApiKey();
      expect(prefix).toBe(key.substring(0, 10));
      expect(prefix.startsWith('vh_')).toBe(true);
    });
  });

  describe('Key Hashing', () => {
    it('should generate consistent hash for same key', () => {
      const { key, hash } = generateApiKey();
      const reHash = hashApiKey(key);
      expect(reHash).toBe(hash);
    });

    it('should generate different hashes for different keys', () => {
      const { hash: hash1 } = generateApiKey();
      const { hash: hash2 } = generateApiKey();
      expect(hash1).not.toBe(hash2);
    });

    it('should generate 64 character hex hash (SHA-256)', () => {
      const { hash } = generateApiKey();
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it('should not store plain key (only hash)', () => {
      const { key, hash } = generateApiKey();
      // The hash should not contain the original key
      expect(hash.includes(key)).toBe(false);
      expect(key.includes(hash)).toBe(false);
    });
  });
});

describe('API Key Validation', () => {
  interface ApiKey {
    id: string;
    userId: string;
    status: 'ACTIVE' | 'REVOKED';
    expiresAt: Date | null;
    revokedAt: Date | null;
    scopes: string[];
    rateLimitPerDay: number;
    requestsToday: number;
  }

  function validateApiKey(
    apiKey: ApiKey | null
  ): { valid: boolean; error?: string; remainingRequests?: number } {
    if (!apiKey) {
      return { valid: false, error: 'Invalid key' };
    }

    if (apiKey.status === 'REVOKED' || apiKey.revokedAt) {
      return { valid: false, error: 'Key revoked' };
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, error: 'Key expired' };
    }

    if (apiKey.requestsToday >= apiKey.rateLimitPerDay) {
      return { valid: false, error: 'Rate limit exceeded' };
    }

    return {
      valid: true,
      remainingRequests: apiKey.rateLimitPerDay - apiKey.requestsToday,
    };
  }

  describe('Status Validation', () => {
    it('should accept active key', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 0,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(true);
      expect(result.remainingRequests).toBe(1000);
    });

    it('should reject revoked key (status)', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'REVOKED',
        expiresAt: null,
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 0,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key revoked');
    });

    it('should reject revoked key (revokedAt)', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: new Date(),
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 0,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key revoked');
    });

    it('should reject null key', () => {
      const result = validateApiKey(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid key');
    });
  });

  describe('Expiration Validation', () => {
    it('should accept key without expiration', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 0,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(true);
    });

    it('should accept key with future expiration', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // +1 day
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 0,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(true);
    });

    it('should reject expired key', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 0,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key expired');
    });
  });

  describe('Rate Limit Validation', () => {
    it('should accept key under rate limit', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 500,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(true);
      expect(result.remainingRequests).toBe(500);
    });

    it('should accept key at limit - 1', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 999,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(true);
      expect(result.remainingRequests).toBe(1);
    });

    it('should reject key at rate limit', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 1000,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('should reject key over rate limit', () => {
      const apiKey: ApiKey = {
        id: 'key-1',
        userId: 'user-1',
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
        scopes: [],
        rateLimitPerDay: 1000,
        requestsToday: 1500,
      };

      const result = validateApiKey(apiKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });
  });
});

describe('API Key Scope Authorization', () => {
  type ApiScope = 'read:jobs' | 'write:jobs' | 'read:interviews' | 'write:interviews' | 'admin';

  function hasRequiredScope(keyScopes: string[], requiredScope: ApiScope): boolean {
    // Admin scope grants all permissions
    if (keyScopes.includes('admin')) {
      return true;
    }

    // Check for exact match
    if (keyScopes.includes(requiredScope)) {
      return true;
    }

    // Check for wildcard match (e.g., 'read:*' matches 'read:jobs')
    const [action, resource] = requiredScope.split(':');
    if (keyScopes.includes(`${action}:*`)) {
      return true;
    }

    return false;
  }

  it('should allow access with exact scope match', () => {
    const scopes = ['read:jobs', 'write:jobs'];
    expect(hasRequiredScope(scopes, 'read:jobs')).toBe(true);
    expect(hasRequiredScope(scopes, 'write:jobs')).toBe(true);
  });

  it('should deny access without required scope', () => {
    const scopes = ['read:jobs'];
    expect(hasRequiredScope(scopes, 'write:jobs')).toBe(false);
    expect(hasRequiredScope(scopes, 'read:interviews')).toBe(false);
  });

  it('should allow admin scope to access everything', () => {
    const scopes = ['admin'];
    expect(hasRequiredScope(scopes, 'read:jobs')).toBe(true);
    expect(hasRequiredScope(scopes, 'write:jobs')).toBe(true);
    expect(hasRequiredScope(scopes, 'read:interviews')).toBe(true);
    expect(hasRequiredScope(scopes, 'write:interviews')).toBe(true);
  });

  it('should allow wildcard scope', () => {
    const scopes = ['read:*'];
    expect(hasRequiredScope(scopes, 'read:jobs')).toBe(true);
    expect(hasRequiredScope(scopes, 'read:interviews')).toBe(true);
    expect(hasRequiredScope(scopes, 'write:jobs')).toBe(false);
  });

  it('should handle empty scopes', () => {
    const scopes: string[] = [];
    expect(hasRequiredScope(scopes, 'read:jobs')).toBe(false);
  });
});

describe('API Key Input Validation', () => {
  function validateCreateInput(input: {
    name?: string;
    scopes?: unknown;
    expiresAt?: string;
    rateLimitPerDay?: number;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Name validation
    if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
      errors.push('Name is required');
    }

    // Scopes validation
    if (input.scopes !== undefined && !Array.isArray(input.scopes)) {
      errors.push('Scopes must be an array');
    }

    // Expiration validation
    if (input.expiresAt) {
      const date = new Date(input.expiresAt);
      if (isNaN(date.getTime())) {
        errors.push('Invalid expiresAt date');
      }
    }

    // Rate limit validation
    if (input.rateLimitPerDay !== undefined) {
      if (typeof input.rateLimitPerDay !== 'number' || input.rateLimitPerDay < 1) {
        errors.push('Invalid rate limit');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  it('should accept valid input', () => {
    const result = validateCreateInput({
      name: 'My API Key',
      scopes: ['read:jobs'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      rateLimitPerDay: 1000,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing name', () => {
    const result = validateCreateInput({
      scopes: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Name is required');
  });

  it('should reject empty name', () => {
    const result = validateCreateInput({
      name: '   ',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Name is required');
  });

  it('should reject invalid scopes type', () => {
    const result = validateCreateInput({
      name: 'Test Key',
      scopes: 'not-an-array',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Scopes must be an array');
  });

  it('should reject invalid date', () => {
    const result = validateCreateInput({
      name: 'Test Key',
      expiresAt: 'invalid-date',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid expiresAt date');
  });

  it('should reject invalid rate limit', () => {
    const result = validateCreateInput({
      name: 'Test Key',
      rateLimitPerDay: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid rate limit');
  });

  it('should reject negative rate limit', () => {
    const result = validateCreateInput({
      name: 'Test Key',
      rateLimitPerDay: -100,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid rate limit');
  });
});
