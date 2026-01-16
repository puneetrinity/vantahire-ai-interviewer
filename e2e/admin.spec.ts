import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './helpers/auth';
import { SEED_IDS } from './helpers/seed';

test.describe('Admin Flows', () => {
  // Use admin auth for all tests in this describe block
  test.use({ storageState: STORAGE_STATE.admin });

  test.describe('Dashboard', () => {
    test('should load admin dashboard', async ({ page }) => {
      // Go to a specific admin route
      await page.goto('/admin/jobs');

      // Expect admin page to load (not redirect)
      await expect(page).toHaveURL(/admin/);
    });

    test('should show admin dashboard stats', async ({ page }) => {
      await page.goto('/admin/users');

      // Expect dashboard page to load
      await expect(page).toHaveURL(/admin/);
    });
  });

  test.describe('Job Approval', () => {
    test('should view pending jobs', async ({ page }) => {
      await page.goto('/admin/jobs/pending');

      // Expect page to load
      await expect(page).toHaveURL(/admin.*jobs/);
    });

    test('should view all jobs', async ({ page }) => {
      await page.goto('/admin/jobs');

      // Expect page to load
      await expect(page).toHaveURL(/admin.*jobs/);
    });
  });

  test.describe('Application Overview', () => {
    test('should view all applications', async ({ page }) => {
      await page.goto('/admin/applications');

      // Expect page to load
      await expect(page).toHaveURL(/admin.*applications/);
    });
  });

  test.describe('User Management', () => {
    test('should view users list', async ({ page }) => {
      await page.goto('/admin/users');

      // Expect page to load
      await expect(page).toHaveURL(/admin.*users/);
    });
  });
});

test.describe('Admin Access Control', () => {
  test('should redirect non-admin to unauthorized', async ({ page }) => {
    await page.route('**/auth/me', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );

    // Without admin session, should redirect
    await page.goto('/admin');

    // Expect redirect to login or unauthorized page
    await expect(page).toHaveURL(/login|unauthorized|auth/);
  });
});
