import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Re-create the env schema for testing (same as in config.ts)
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().url().default('http://localhost:3000'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  LINKEDIN_CLIENT_ID: z.string(),
  LINKEDIN_CLIENT_SECRET: z.string(),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 7),
  INTERVIEW_SESSION_TTL_HOURS: z.coerce.number().default(72),
  GROQ_API_KEY: z.string(),
  DEEPGRAM_API_KEY: z.string(),
  CARTESIA_API_KEY: z.string().optional(),
  TTS_PROVIDER: z.enum(['deepgram', 'cartesia']).default('deepgram'),
  GCS_BUCKET: z.string().optional(),
  GCS_PROJECT_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().default('VantaHire'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  BREVO_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
}).refine(
  (data) => data.TTS_PROVIDER !== 'cartesia' || (data.CARTESIA_API_KEY && data.CARTESIA_API_KEY.trim() !== ''),
  {
    message: 'CARTESIA_API_KEY is required when TTS_PROVIDER is set to cartesia',
    path: ['CARTESIA_API_KEY'],
  }
);

describe('Config Validation', () => {
  describe('Required Environment Variables', () => {
    it('should fail when DATABASE_URL is missing', () => {
      const env = {
        GOOGLE_CLIENT_ID: 'test',
        GOOGLE_CLIENT_SECRET: 'test',
        LINKEDIN_CLIENT_ID: 'test',
        LINKEDIN_CLIENT_SECRET: 'test',
        SESSION_SECRET: 'test-session-secret-that-is-32-chars',
        GROQ_API_KEY: 'test',
        DEEPGRAM_API_KEY: 'test',
      };

      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors).toHaveProperty('DATABASE_URL');
      }
    });

    it('should fail when GOOGLE_CLIENT_ID is missing', () => {
      const env = {
        DATABASE_URL: 'postgres://localhost:5432/test',
        GOOGLE_CLIENT_SECRET: 'test',
        LINKEDIN_CLIENT_ID: 'test',
        LINKEDIN_CLIENT_SECRET: 'test',
        SESSION_SECRET: 'test-session-secret-that-is-32-chars',
        GROQ_API_KEY: 'test',
        DEEPGRAM_API_KEY: 'test',
      };

      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it('should fail when SESSION_SECRET is too short', () => {
      const env = {
        DATABASE_URL: 'postgres://localhost:5432/test',
        GOOGLE_CLIENT_ID: 'test',
        GOOGLE_CLIENT_SECRET: 'test',
        LINKEDIN_CLIENT_ID: 'test',
        LINKEDIN_CLIENT_SECRET: 'test',
        SESSION_SECRET: 'short', // Less than 32 chars
        GROQ_API_KEY: 'test',
        DEEPGRAM_API_KEY: 'test',
      };

      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors).toHaveProperty('SESSION_SECRET');
      }
    });

    it('should pass with all required variables', () => {
      const env = {
        DATABASE_URL: 'postgres://localhost:5432/test',
        GOOGLE_CLIENT_ID: 'test',
        GOOGLE_CLIENT_SECRET: 'test',
        LINKEDIN_CLIENT_ID: 'test',
        LINKEDIN_CLIENT_SECRET: 'test',
        SESSION_SECRET: 'test-session-secret-that-is-32-chars-long',
        GROQ_API_KEY: 'test',
        DEEPGRAM_API_KEY: 'test',
      };

      const result = envSchema.safeParse(env);
      expect(result.success).toBe(true);
    });
  });

  describe('Default Values', () => {
    const validEnv = {
      DATABASE_URL: 'postgres://localhost:5432/test',
      GOOGLE_CLIENT_ID: 'test',
      GOOGLE_CLIENT_SECRET: 'test',
      LINKEDIN_CLIENT_ID: 'test',
      LINKEDIN_CLIENT_SECRET: 'test',
      SESSION_SECRET: 'test-session-secret-that-is-32-chars-long',
      GROQ_API_KEY: 'test',
      DEEPGRAM_API_KEY: 'test',
    };

    it('should use default PORT of 3000', () => {
      const result = envSchema.parse(validEnv);
      expect(result.PORT).toBe(3000);
    });

    it('should use default NODE_ENV of development', () => {
      const result = envSchema.parse(validEnv);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should use default API_URL', () => {
      const result = envSchema.parse(validEnv);
      expect(result.API_URL).toBe('http://localhost:3000');
    });

    it('should use default CLIENT_URL', () => {
      const result = envSchema.parse(validEnv);
      expect(result.CLIENT_URL).toBe('http://localhost:5173');
    });

    it('should use default REDIS_URL', () => {
      const result = envSchema.parse(validEnv);
      expect(result.REDIS_URL).toBe('redis://localhost:6379');
    });

    it('should use default SESSION_TTL_SECONDS (7 days)', () => {
      const result = envSchema.parse(validEnv);
      expect(result.SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 7);
    });

    it('should use default INTERVIEW_SESSION_TTL_HOURS (72)', () => {
      const result = envSchema.parse(validEnv);
      expect(result.INTERVIEW_SESSION_TTL_HOURS).toBe(72);
    });

    it('should use default TTS_PROVIDER of deepgram', () => {
      const result = envSchema.parse(validEnv);
      expect(result.TTS_PROVIDER).toBe('deepgram');
    });

    it('should use default MAX_FILE_SIZE_MB of 10', () => {
      const result = envSchema.parse(validEnv);
      expect(result.MAX_FILE_SIZE_MB).toBe(10);
    });

    it('should use default BREVO_SENDER_NAME', () => {
      const result = envSchema.parse(validEnv);
      expect(result.BREVO_SENDER_NAME).toBe('VantaHire');
    });
  });

  describe('Type Coercion', () => {
    const baseEnv = {
      DATABASE_URL: 'postgres://localhost:5432/test',
      GOOGLE_CLIENT_ID: 'test',
      GOOGLE_CLIENT_SECRET: 'test',
      LINKEDIN_CLIENT_ID: 'test',
      LINKEDIN_CLIENT_SECRET: 'test',
      SESSION_SECRET: 'test-session-secret-that-is-32-chars-long',
      GROQ_API_KEY: 'test',
      DEEPGRAM_API_KEY: 'test',
    };

    it('should coerce PORT string to number', () => {
      const env = { ...baseEnv, PORT: '8080' };
      const result = envSchema.parse(env);
      expect(result.PORT).toBe(8080);
      expect(typeof result.PORT).toBe('number');
    });

    it('should coerce SESSION_TTL_SECONDS string to number', () => {
      const env = { ...baseEnv, SESSION_TTL_SECONDS: '3600' };
      const result = envSchema.parse(env);
      expect(result.SESSION_TTL_SECONDS).toBe(3600);
    });

    it('should coerce MAX_FILE_SIZE_MB string to number', () => {
      const env = { ...baseEnv, MAX_FILE_SIZE_MB: '25' };
      const result = envSchema.parse(env);
      expect(result.MAX_FILE_SIZE_MB).toBe(25);
    });
  });

  describe('NODE_ENV Validation', () => {
    const baseEnv = {
      DATABASE_URL: 'postgres://localhost:5432/test',
      GOOGLE_CLIENT_ID: 'test',
      GOOGLE_CLIENT_SECRET: 'test',
      LINKEDIN_CLIENT_ID: 'test',
      LINKEDIN_CLIENT_SECRET: 'test',
      SESSION_SECRET: 'test-session-secret-that-is-32-chars-long',
      GROQ_API_KEY: 'test',
      DEEPGRAM_API_KEY: 'test',
    };

    it('should accept development', () => {
      const env = { ...baseEnv, NODE_ENV: 'development' };
      const result = envSchema.parse(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should accept production', () => {
      const env = { ...baseEnv, NODE_ENV: 'production' };
      const result = envSchema.parse(env);
      expect(result.NODE_ENV).toBe('production');
    });

    it('should accept test', () => {
      const env = { ...baseEnv, NODE_ENV: 'test' };
      const result = envSchema.parse(env);
      expect(result.NODE_ENV).toBe('test');
    });

    it('should reject invalid NODE_ENV', () => {
      const env = { ...baseEnv, NODE_ENV: 'staging' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });
  });

  describe('TTS_PROVIDER Validation', () => {
    const baseEnv = {
      DATABASE_URL: 'postgres://localhost:5432/test',
      GOOGLE_CLIENT_ID: 'test',
      GOOGLE_CLIENT_SECRET: 'test',
      LINKEDIN_CLIENT_ID: 'test',
      LINKEDIN_CLIENT_SECRET: 'test',
      SESSION_SECRET: 'test-session-secret-that-is-32-chars-long',
      GROQ_API_KEY: 'test',
      DEEPGRAM_API_KEY: 'test',
    };

    it('should accept deepgram', () => {
      const env = { ...baseEnv, TTS_PROVIDER: 'deepgram' };
      const result = envSchema.parse(env);
      expect(result.TTS_PROVIDER).toBe('deepgram');
    });

    it('should accept cartesia when CARTESIA_API_KEY is provided', () => {
      const env = { ...baseEnv, TTS_PROVIDER: 'cartesia', CARTESIA_API_KEY: 'test-cartesia-key' };
      const result = envSchema.parse(env);
      expect(result.TTS_PROVIDER).toBe('cartesia');
    });

    it('should reject cartesia when CARTESIA_API_KEY is missing', () => {
      const env = { ...baseEnv, TTS_PROVIDER: 'cartesia' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors).toHaveProperty('CARTESIA_API_KEY');
      }
    });

    it('should reject cartesia when CARTESIA_API_KEY is empty', () => {
      const env = { ...baseEnv, TTS_PROVIDER: 'cartesia', CARTESIA_API_KEY: '' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it('should reject cartesia when CARTESIA_API_KEY is whitespace', () => {
      const env = { ...baseEnv, TTS_PROVIDER: 'cartesia', CARTESIA_API_KEY: '   ' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it('should reject invalid TTS_PROVIDER', () => {
      const env = { ...baseEnv, TTS_PROVIDER: 'openai' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });
  });

  describe('URL Validation', () => {
    const baseEnv = {
      DATABASE_URL: 'postgres://localhost:5432/test',
      GOOGLE_CLIENT_ID: 'test',
      GOOGLE_CLIENT_SECRET: 'test',
      LINKEDIN_CLIENT_ID: 'test',
      LINKEDIN_CLIENT_SECRET: 'test',
      SESSION_SECRET: 'test-session-secret-that-is-32-chars-long',
      GROQ_API_KEY: 'test',
      DEEPGRAM_API_KEY: 'test',
    };

    it('should accept valid API_URL', () => {
      const env = { ...baseEnv, API_URL: 'https://api.example.com' };
      const result = envSchema.parse(env);
      expect(result.API_URL).toBe('https://api.example.com');
    });

    it('should reject invalid API_URL', () => {
      const env = { ...baseEnv, API_URL: 'not-a-url' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it('should accept valid CLIENT_URL', () => {
      const env = { ...baseEnv, CLIENT_URL: 'https://app.example.com' };
      const result = envSchema.parse(env);
      expect(result.CLIENT_URL).toBe('https://app.example.com');
    });
  });

  describe('Optional Fields', () => {
    const baseEnv = {
      DATABASE_URL: 'postgres://localhost:5432/test',
      GOOGLE_CLIENT_ID: 'test',
      GOOGLE_CLIENT_SECRET: 'test',
      LINKEDIN_CLIENT_ID: 'test',
      LINKEDIN_CLIENT_SECRET: 'test',
      SESSION_SECRET: 'test-session-secret-that-is-32-chars-long',
      GROQ_API_KEY: 'test',
      DEEPGRAM_API_KEY: 'test',
    };

    it('should allow missing CARTESIA_API_KEY', () => {
      const result = envSchema.parse(baseEnv);
      expect(result.CARTESIA_API_KEY).toBeUndefined();
    });

    it('should allow missing GCS_BUCKET', () => {
      const result = envSchema.parse(baseEnv);
      expect(result.GCS_BUCKET).toBeUndefined();
    });

    it('should allow missing BREVO_API_KEY', () => {
      const result = envSchema.parse(baseEnv);
      expect(result.BREVO_API_KEY).toBeUndefined();
    });

    it('should allow missing WHATSAPP_ACCESS_TOKEN', () => {
      const result = envSchema.parse(baseEnv);
      expect(result.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
    });

    it('should validate BREVO_SENDER_EMAIL format when provided', () => {
      const env = { ...baseEnv, BREVO_SENDER_EMAIL: 'invalid-email' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it('should accept valid BREVO_SENDER_EMAIL', () => {
      const env = { ...baseEnv, BREVO_SENDER_EMAIL: 'noreply@example.com' };
      const result = envSchema.parse(env);
      expect(result.BREVO_SENDER_EMAIL).toBe('noreply@example.com');
    });
  });
});
