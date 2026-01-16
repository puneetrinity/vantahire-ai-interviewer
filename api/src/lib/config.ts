import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().url().default('http://localhost:3000'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // OAuth - Google
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),

  // OAuth - LinkedIn
  LINKEDIN_CLIENT_ID: z.string(),
  LINKEDIN_CLIENT_SECRET: z.string(),

  // Session
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 7), // 7 days

  // Interview Session (candidate access)
  INTERVIEW_SESSION_TTL_HOURS: z.coerce.number().default(72),

  // AI - Groq
  GROQ_API_KEY: z.string(),

  // Voice - Deepgram (primary)
  DEEPGRAM_API_KEY: z.string(),

  // Voice - Cartesia (requires key when selected as TTS_PROVIDER)
  CARTESIA_API_KEY: z.string().optional(),

  // TTS Provider: 'deepgram' | 'cartesia'
  TTS_PROVIDER: z.enum(['deepgram', 'cartesia']).default('deepgram'),

  // Google Cloud Storage (for video recordings)
  GCS_BUCKET: z.string().optional(),
  GCS_PROJECT_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // Brevo (email)
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().default('VantaHire'),

  // WhatsApp Cloud API (Meta)
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(), // For webhook verification

  // Webhook secrets
  BREVO_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(), // For signature validation

  // File limits
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),

  // E2E test auth (non-production only)
  E2E_AUTH_TOKEN: z.string().optional(),
}).refine(
  (data) => data.TTS_PROVIDER !== 'cartesia' || (data.CARTESIA_API_KEY && data.CARTESIA_API_KEY.trim() !== ''),
  {
    message: 'CARTESIA_API_KEY is required when TTS_PROVIDER is set to cartesia',
    path: ['CARTESIA_API_KEY'],
  }
);

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export type Config = z.infer<typeof envSchema>;
