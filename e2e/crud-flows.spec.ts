import { test, expect, request } from '@playwright/test';
import { E2E_API_URL, STORAGE_STATE } from './helpers/auth';

test.describe.serial('CRUD flows (API-backed)', () => {
  let jobId: string | null = null;
  let interviewId: string | null = null;
  let applicationId: string | null = null;

  test('recruiter creates and updates a job', async () => {
    const recruiter = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.recruiter,
    });

    const createRes = await recruiter.post('/jobs', {
      data: {
        title: `E2E Job ${Date.now()}`,
        description: 'E2E created job',
        department: 'Engineering',
        location: 'Remote',
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    jobId = created.id;

    const updateRes = await recruiter.patch(`/jobs/${jobId}`, {
      data: { title: `${created.title} Updated` },
    });
    expect(updateRes.ok()).toBe(true);

    await recruiter.dispose();
  });

  test('admin approves the job', async () => {
    expect(jobId).toBeTruthy();
    const admin = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.admin,
    });

    const res = await admin.post(`/jobs/admin/${jobId}/approve`);
    expect(res.ok()).toBe(true);

    await admin.dispose();
  });

  test('recruiter publishes the job', async () => {
    expect(jobId).toBeTruthy();
    const recruiter = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.recruiter,
    });

    const res = await recruiter.post(`/jobs/${jobId}/status`, {
      data: { status: 'ACTIVE' },
    });
    expect(res.ok()).toBe(true);

    await recruiter.dispose();
  });

  test('recruiter creates and deletes an interview', async () => {
    const recruiter = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.recruiter,
    });

    const createRes = await recruiter.post('/interviews', {
      data: {
        candidateEmail: `candidate+${Date.now()}@test.com`,
        candidateName: 'E2E Candidate',
        jobRole: 'Software Engineer',
        type: 'TEXT',
        timeLimitMinutes: 30,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    interviewId = created.id;

    const deleteRes = await recruiter.delete(`/interviews/${interviewId}`);
    expect(deleteRes.ok()).toBe(true);

    await recruiter.dispose();
  });

  test('candidate applies and recruiter reviews the application', async () => {
    expect(jobId).toBeTruthy();

    const candidate = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.candidate,
    });
    const applyRes = await candidate.post('/applications', {
      data: {
        jobId,
        coverLetter: 'E2E application',
      },
    });
    expect(applyRes.status()).toBe(201);
    const applied = await applyRes.json();
    applicationId = applied.id;
    await candidate.dispose();

    const recruiter = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.recruiter,
    });
    const reviewRes = await recruiter.patch(`/applications/${applicationId}/status`, {
      data: { status: 'REVIEWED' },
    });
    expect(reviewRes.ok()).toBe(true);
    await recruiter.dispose();
  });

  test('candidate withdraws the application', async () => {
    expect(applicationId).toBeTruthy();
    const candidate = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.candidate,
    });

    const res = await candidate.delete(`/applications/mine/${applicationId}`);
    expect(res.ok()).toBe(true);

    await candidate.dispose();
  });

  test('recruiter deletes the job', async () => {
    expect(jobId).toBeTruthy();
    const recruiter = await request.newContext({
      baseURL: E2E_API_URL,
      storageState: STORAGE_STATE.recruiter,
    });

    const res = await recruiter.delete(`/jobs/${jobId}`);
    expect(res.ok()).toBe(true);

    await recruiter.dispose();
  });
});
