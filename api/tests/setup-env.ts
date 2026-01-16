import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const envPath = resolve(process.cwd(), '.env.test');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

process.env.NODE_ENV ||= 'test';
process.env.PORT ||= '3001';
process.env.API_URL ||= 'http://localhost:3001';
process.env.CLIENT_URL ||= 'http://localhost:5173';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@localhost:5432/vantahire_test';
process.env.REDIS_URL ||= 'redis://localhost:6379';

process.env.GOOGLE_CLIENT_ID ||= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ||= 'test-google-client-secret';
process.env.LINKEDIN_CLIENT_ID ||= 'test-linkedin-client-id';
process.env.LINKEDIN_CLIENT_SECRET ||= 'test-linkedin-client-secret';

process.env.SESSION_SECRET ||= 'test-session-secret-32-chars-minimum';

process.env.GROQ_API_KEY ||= 'test-groq-key';
process.env.DEEPGRAM_API_KEY ||= 'test-deepgram-key';
process.env.CARTESIA_API_KEY ||= 'test-cartesia-key';
