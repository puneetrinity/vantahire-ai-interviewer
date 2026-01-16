/**
 * Database seed script for test data
 * Usage: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Deterministic test IDs for reliable test assertions
export const TEST_IDS = {
  recruiter: '00000000-0000-4000-8000-000000000001',
  candidate: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000003',
  recruiterProfile: '00000000-0000-4000-8000-000000000011',
  candidateProfile: '00000000-0000-4000-8000-000000000012',
  job1: '00000000-0000-4000-8000-000000000021',
  job2: '00000000-0000-4000-8000-000000000022',
  interview1: '00000000-0000-4000-8000-000000000031',
  interview2: '00000000-0000-4000-8000-000000000032',
  session1: '00000000-0000-4000-8000-000000000041',
  session2: '00000000-0000-4000-8000-000000000042',
  application1: '00000000-0000-4000-8000-000000000051',
  file1: '00000000-0000-4000-8000-000000000061',
};

async function seed() {
  console.log('Seeding database...');
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const interviewToken = 'test-interview-token';
  const voiceInterviewToken = 'test-voice-token';

  // Clean existing test data
  await prisma.interviewMessage.deleteMany({});
  await prisma.interviewSession.deleteMany({});
  await prisma.interview.deleteMany({});
  await prisma.jobApplication.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.file.deleteMany({});
  await prisma.candidateProfile.deleteMany({});
  await prisma.recruiterProfile.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Cleaned existing data');

  // Create users
  const recruiter = await prisma.user.create({
    data: {
      id: TEST_IDS.recruiter,
      email: 'recruiter@test.com',
      role: 'RECRUITER',
      provider: 'test',
      providerId: 'test-recruiter-1',
      fullName: 'Test Recruiter',
    },
  });

  const candidate = await prisma.user.create({
    data: {
      id: TEST_IDS.candidate,
      email: 'candidate@test.com',
      role: 'CANDIDATE',
      provider: 'test',
      providerId: 'test-candidate-1',
      fullName: 'Test Candidate',
    },
  });

  const admin = await prisma.user.create({
    data: {
      id: TEST_IDS.admin,
      email: 'admin@test.com',
      role: 'ADMIN',
      provider: 'test',
      providerId: 'test-admin-1',
      fullName: 'Test Admin',
    },
  });

  console.log('Created users:', { recruiter: recruiter.id, candidate: candidate.id, admin: admin.id });

  // Create recruiter profile
  const recruiterProfile = await prisma.recruiterProfile.create({
    data: {
      id: TEST_IDS.recruiterProfile,
      userId: recruiter.id,
      companyName: 'Test Company Inc.',
      brandColor: '#3B82F6',
      emailIntro: 'Thank you for applying!',
    },
  });

  // Create candidate profile
  const candidateProfile = await prisma.candidateProfile.create({
    data: {
      id: TEST_IDS.candidateProfile,
      userId: candidate.id,
      fullName: 'Test Candidate',
      email: 'candidate@test.com',
      phone: '+1234567890',
      bio: 'Experienced software engineer',
      skills: ['TypeScript', 'React', 'Node.js'],
      experienceYears: 5,
    },
  });

  console.log('Created profiles');

  // Create jobs
  const job1 = await prisma.job.create({
    data: {
      id: TEST_IDS.job1,
      recruiterId: recruiter.id,
      title: 'Senior Software Engineer',
      description: 'We are looking for a senior engineer...',
      department: 'Engineering',
      location: 'Remote',
      jobType: 'Full-time',
      salaryRange: '$120k - $180k',
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: admin.id,
    },
  });

  const job2 = await prisma.job.create({
    data: {
      id: TEST_IDS.job2,
      recruiterId: recruiter.id,
      title: 'Product Manager',
      description: 'Looking for an experienced PM...',
      department: 'Product',
      location: 'New York',
      jobType: 'Full-time',
      status: 'DRAFT',
      approvalStatus: 'PENDING',
    },
  });

  console.log('Created jobs:', { job1: job1.id, job2: job2.id });

  // Create interview
  const interview1 = await prisma.interview.create({
    data: {
      id: TEST_IDS.interview1,
      recruiterId: recruiter.id,
      jobId: job1.id,
      candidateEmail: 'candidate@test.com',
      candidateName: 'Test Candidate',
      candidateUserId: candidate.id,
      jobRole: 'Senior Software Engineer',
      type: 'TEXT',
      status: 'PENDING',
      timeLimitMinutes: 30,
      interviewUrl: `${clientUrl}/interview/${TEST_IDS.interview1}?token=${interviewToken}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
    },
  });

  const interview2 = await prisma.interview.create({
    data: {
      id: TEST_IDS.interview2,
      recruiterId: recruiter.id,
      candidateEmail: 'external@example.com',
      candidateName: 'External Candidate',
      jobRole: 'Product Manager',
      type: 'VOICE',
      status: 'PENDING',
      timeLimitMinutes: 45,
      interviewUrl: `${clientUrl}/voice-interview/${TEST_IDS.interview2}?token=${voiceInterviewToken}`,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 days
    },
  });

  console.log('Created interviews:', { interview1: interview1.id, interview2: interview2.id });

  // Create interview session
  const session1 = await prisma.interviewSession.create({
    data: {
      id: TEST_IDS.session1,
      interviewId: interview1.id,
      token: interviewToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const session2 = await prisma.interviewSession.create({
    data: {
      id: TEST_IDS.session2,
      interviewId: interview2.id,
      token: voiceInterviewToken,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('Created sessions:', { session1: session1.id, session2: session2.id });

  // Create job application
  const application1 = await prisma.jobApplication.create({
    data: {
      id: TEST_IDS.application1,
      jobId: job1.id,
      candidateId: candidate.id,
      coverLetter: 'I am excited to apply for this position...',
      status: 'PENDING',
    },
  });

  console.log('Created application:', application1.id);

  // Create a test file (logo)
  const file1 = await prisma.file.create({
    data: {
      id: TEST_IDS.file1,
      name: 'company-logo.png',
      mimeType: 'image/png',
      size: 1024,
      category: 'LOGO',
      uploadedBy: recruiter.id,
      data: Buffer.from('fake-image-data'),
    },
  });

  // Update recruiter profile with logo
  await prisma.recruiterProfile.update({
    where: { id: recruiterProfile.id },
    data: { logoFileId: file1.id },
  });

  console.log('Created file and linked to profile');

  console.log('');
  console.log('=== Seed Complete ===');
  console.log('Test accounts:');
  console.log('  Recruiter: recruiter@test.com');
  console.log('  Candidate: candidate@test.com');
  console.log('  Admin: admin@test.com');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
