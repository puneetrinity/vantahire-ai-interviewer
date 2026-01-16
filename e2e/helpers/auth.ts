import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const AUTH_DIR = path.join(rootDir, '.auth');

export const STORAGE_STATE = {
  recruiter: path.join(AUTH_DIR, 'recruiter.json'),
  candidate: path.join(AUTH_DIR, 'candidate.json'),
  admin: path.join(AUTH_DIR, 'admin.json'),
};

export const E2E_API_URL = process.env.E2E_API_URL || 'http://localhost:3000';
export const E2E_AUTH_TOKEN = process.env.E2E_AUTH_TOKEN || '';
