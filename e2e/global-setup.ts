import { mkdirSync } from 'fs';
import { chromium } from '@playwright/test';
import { AUTH_DIR, STORAGE_STATE, E2E_API_URL, E2E_AUTH_TOKEN } from './helpers/auth';

const USERS = {
  recruiter: {
    email: 'recruiter@test.com',
    role: 'RECRUITER',
    fullName: 'Test Recruiter',
  },
  candidate: {
    email: 'candidate@test.com',
    role: 'CANDIDATE',
    fullName: 'Test Candidate',
  },
  admin: {
    email: 'admin@test.com',
    role: 'ADMIN',
    fullName: 'Test Admin',
  },
};

export default async function globalSetup() {
  if (!E2E_AUTH_TOKEN) {
    console.warn('E2E_AUTH_TOKEN not set; skipping auth storage state generation.');
    return;
  }

  mkdirSync(AUTH_DIR, { recursive: true });

  // Use a browser context to properly set cookies
  const browser = await chromium.launch();

  for (const [key, user] of Object.entries(USERS)) {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Make the test-login request via the page to set cookies properly
    const response = await page.request.post(`${E2E_API_URL}/auth/test-login`, {
      headers: { 'X-Test-Token': E2E_AUTH_TOKEN },
      data: user,
    });

    if (!response.ok()) {
      const body = await response.text();
      await browser.close();
      throw new Error(`Failed to create ${key} session: ${response.status()} ${body}`);
    }

    // Save storage state
    await context.storageState({ path: STORAGE_STATE[key as keyof typeof STORAGE_STATE] });
    await context.close();
  }

  await browser.close();
}
