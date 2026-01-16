import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import type { Hono } from 'hono';

// Test database client
export const testDb = new PrismaClient();

// Mock session data for testing
export interface MockSession {
  userId: string;
  email: string;
  role: 'RECRUITER' | 'CANDIDATE' | 'ADMIN';
  createdAt: number;
}

// Test user fixtures
export const fixtures = {
  recruiter: {
    id: 'test-recruiter-id',
    email: 'recruiter@test.com',
    role: 'RECRUITER' as const,
    fullName: 'Test Recruiter',
    provider: 'google',
    providerId: 'google-recruiter-id',
  },
  candidate: {
    id: 'test-candidate-id',
    email: 'candidate@test.com',
    role: 'CANDIDATE' as const,
    fullName: 'Test Candidate',
    provider: 'google',
    providerId: 'google-candidate-id',
  },
  admin: {
    id: 'test-admin-id',
    email: 'admin@test.com',
    role: 'ADMIN' as const,
    fullName: 'Test Admin',
    provider: 'google',
    providerId: 'google-admin-id',
  },
};

// Session fixtures
export const sessions: Record<string, MockSession> = {
  recruiter: {
    userId: fixtures.recruiter.id,
    email: fixtures.recruiter.email,
    role: 'RECRUITER',
    createdAt: Date.now(),
  },
  candidate: {
    userId: fixtures.candidate.id,
    email: fixtures.candidate.email,
    role: 'CANDIDATE',
    createdAt: Date.now(),
  },
  admin: {
    userId: fixtures.admin.id,
    email: fixtures.admin.email,
    role: 'ADMIN',
    createdAt: Date.now(),
  },
};

// Generate unique IDs for tests
export function generateId(): string {
  return nanoid();
}

// Create auth cookie header for testing
export function createAuthCookie(sessionId: string): string {
  return `session=${sessionId}`;
}

// Helper to make authenticated requests
export async function authRequest(
  app: Hono,
  method: string,
  path: string,
  options: {
    body?: unknown;
    sessionId?: string;
    interviewToken?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (options.sessionId) {
    headers['Cookie'] = createAuthCookie(options.sessionId);
  }

  if (options.interviewToken) {
    headers['X-Interview-Token'] = options.interviewToken;
  }

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const requestInit: RequestInit = {
    method,
    headers,
  };

  if (options.body) {
    requestInit.body = JSON.stringify(options.body);
  }

  return app.request(path, requestInit);
}

// Database seeding helpers
export async function seedUsers(): Promise<void> {
  await testDb.user.createMany({
    data: [fixtures.recruiter, fixtures.candidate, fixtures.admin],
    skipDuplicates: true,
  });
}

export async function seedRecruiterProfile(userId: string): Promise<void> {
  await testDb.recruiterProfile.upsert({
    where: { userId },
    create: {
      userId,
      companyName: 'Test Company',
    },
    update: {},
  });
}

export async function seedCandidateProfile(userId: string): Promise<void> {
  await testDb.candidateProfile.upsert({
    where: { userId },
    create: {
      userId,
      bio: 'Test candidate bio',
      skills: ['JavaScript', 'TypeScript', 'React'],
      experienceYears: 5,
    },
    update: {},
  });
}

export async function seedJob(recruiterId: string, overrides: Record<string, unknown> = {}): Promise<{ id: string }> {
  return testDb.job.create({
    data: {
      recruiterId,
      title: 'Test Job',
      description: 'Test job description',
      department: 'Engineering',
      location: 'Remote',
      jobType: 'Full-time',
      status: 'DRAFT',
      approvalStatus: 'PENDING',
      ...overrides,
    },
    select: { id: true },
  });
}

export async function seedInterview(
  recruiterId: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; interviewUrl: string | null }> {
  const interview = await testDb.interview.create({
    data: {
      recruiterId,
      candidateEmail: 'candidate@test.com',
      candidateName: 'Test Candidate',
      jobRole: 'Software Engineer',
      type: 'TEXT',
      timeLimitMinutes: 30,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...overrides,
    },
    select: { id: true, interviewUrl: true },
  });
  return interview;
}

export async function seedInterviewSession(
  interviewId: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; token: string }> {
  const token = nanoid(32);
  const session = await testDb.interviewSession.create({
    data: {
      interviewId,
      token,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      ...overrides,
    },
    select: { id: true, token: true },
  });
  return session;
}

export async function seedJobApplication(
  jobId: string,
  candidateId: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string }> {
  return testDb.jobApplication.create({
    data: {
      jobId,
      candidateId,
      status: 'PENDING',
      ...overrides,
    },
    select: { id: true },
  });
}

export async function seedApiKey(
  userId: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; key: string }> {
  const key = `vhk_${nanoid(32)}`;
  const keyHash = key; // In real tests, we'd hash this
  const keyPrefix = 'vhk_';

  const apiKey = await testDb.apiKey.create({
    data: {
      userId,
      name: 'Test API Key',
      keyHash,
      keyPrefix,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      ...overrides,
    },
    select: { id: true },
  });

  return { id: apiKey.id, key };
}

// Cleanup helpers
export async function cleanupTestData(): Promise<void> {
  // Delete in correct order to respect foreign keys
  await testDb.interviewMessage.deleteMany({});
  await testDb.interviewSession.deleteMany({});
  await testDb.interview.deleteMany({});
  await testDb.jobApplication.deleteMany({});
  await testDb.job.deleteMany({});
  await testDb.apiUsageLog.deleteMany({});
  await testDb.apiKey.deleteMany({});
  await testDb.file.deleteMany({});
  await testDb.recruiterProfile.deleteMany({});
  await testDb.candidateProfile.deleteMany({});
  await testDb.user.deleteMany({});
}

export async function disconnectTestDb(): Promise<void> {
  await testDb.$disconnect();
}

// Response helpers
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export function expectStatus(response: Response, status: number): void {
  if (response.status !== status) {
    throw new Error(`Expected status ${status} but got ${response.status}`);
  }
}

// FormData helper for file uploads
export function createFileFormData(
  file: {
    name: string;
    content: Buffer | string;
    type: string;
  },
  fields: Record<string, string>
): FormData {
  const formData = new FormData();

  const blob = new Blob(
    [typeof file.content === 'string' ? file.content : file.content],
    { type: file.type }
  );
  formData.append('file', blob, file.name);

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  return formData;
}
