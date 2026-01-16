/**
 * DB Integration Tests: Webhooks (EmailMessage, WhatsAppMessage)
 *
 * Run with: npm run test:db
 * Requires: DATABASE_URL and seeded database
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma, TEST_IDS, setupDbTests, teardownDbTests } from './setup.js';

describe('Webhooks DB Integration', () => {
  beforeAll(async () => {
    await setupDbTests();
  });

  afterAll(async () => {
    await teardownDbTests();
  });

  describe('EmailMessage', () => {
    const tempEmailId = '00000000-0000-4000-8000-000000009996';

    afterAll(async () => {
      await prisma.emailMessage.deleteMany({ where: { id: tempEmailId } });
    });

    it('should create email message', async () => {
      const email = await prisma.emailMessage.create({
        data: {
          id: tempEmailId,
          interviewId: TEST_IDS.interview1,
          recipientEmail: 'candidate@example.com',
          status: 'pending',
        },
      });

      expect(email.id).toBe(tempEmailId);
      expect(email.status).toBe('pending');
      expect(email.recipientEmail).toBe('candidate@example.com');
    });

    it('should update email status to sent', async () => {
      const updated = await prisma.emailMessage.update({
        where: { id: tempEmailId },
        data: {
          status: 'sent',
          messageId: 'brevo-msg-12345',
          sentAt: new Date(),
        },
      });

      expect(updated.status).toBe('sent');
      expect(updated.messageId).toBe('brevo-msg-12345');
      expect(updated.sentAt).not.toBeNull();
    });

    it('should update email status to delivered', async () => {
      const updated = await prisma.emailMessage.update({
        where: { id: tempEmailId },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });

      expect(updated.status).toBe('delivered');
      expect(updated.deliveredAt).not.toBeNull();
    });

    it('should update email status to opened', async () => {
      const updated = await prisma.emailMessage.update({
        where: { id: tempEmailId },
        data: {
          status: 'opened',
          openedAt: new Date(),
        },
      });

      expect(updated.status).toBe('opened');
      expect(updated.openedAt).not.toBeNull();
    });

    it('should handle email bounce', async () => {
      const bounceEmailId = '00000000-0000-4000-8000-000000009997';

      const email = await prisma.emailMessage.create({
        data: {
          id: bounceEmailId,
          interviewId: TEST_IDS.interview1,
          recipientEmail: 'invalid@example.com',
          status: 'bounced',
          bouncedAt: new Date(),
          errorMessage: 'Mailbox not found',
        },
      });

      expect(email.status).toBe('bounced');
      expect(email.errorMessage).toBe('Mailbox not found');

      // Cleanup
      await prisma.emailMessage.delete({ where: { id: bounceEmailId } });
    });

    it('should find email by messageId', async () => {
      const email = await prisma.emailMessage.findUnique({
        where: { messageId: 'brevo-msg-12345' },
      });

      expect(email).not.toBeNull();
      expect(email?.id).toBe(tempEmailId);
    });

    it('should include interview relation', async () => {
      const email = await prisma.emailMessage.findUnique({
        where: { id: tempEmailId },
        include: { interview: true },
      });

      expect(email?.interview).not.toBeNull();
      expect(email?.interview.id).toBe(TEST_IDS.interview1);
    });

    it('should get emails for interview', async () => {
      const emails = await prisma.emailMessage.findMany({
        where: { interviewId: TEST_IDS.interview1 },
      });

      expect(emails.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppMessage', () => {
    const tempWhatsAppId = '00000000-0000-4000-8000-000000009998';

    afterAll(async () => {
      await prisma.whatsAppMessage.deleteMany({ where: { id: tempWhatsAppId } });
    });

    it('should create WhatsApp message', async () => {
      const message = await prisma.whatsAppMessage.create({
        data: {
          id: tempWhatsAppId,
          interviewId: TEST_IDS.interview1,
          candidatePhone: '+1234567890',
          status: 'pending',
        },
      });

      expect(message.id).toBe(tempWhatsAppId);
      expect(message.status).toBe('pending');
      expect(message.candidatePhone).toBe('+1234567890');
    });

    it('should update WhatsApp status to sent', async () => {
      const updated = await prisma.whatsAppMessage.update({
        where: { id: tempWhatsAppId },
        data: {
          status: 'sent',
          messageId: 'wa-msg-67890',
          sentAt: new Date(),
        },
      });

      expect(updated.status).toBe('sent');
      expect(updated.messageId).toBe('wa-msg-67890');
      expect(updated.sentAt).not.toBeNull();
    });

    it('should update WhatsApp status to delivered', async () => {
      const updated = await prisma.whatsAppMessage.update({
        where: { id: tempWhatsAppId },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });

      expect(updated.status).toBe('delivered');
      expect(updated.deliveredAt).not.toBeNull();
    });

    it('should update WhatsApp status to read', async () => {
      const updated = await prisma.whatsAppMessage.update({
        where: { id: tempWhatsAppId },
        data: {
          status: 'read',
          readAt: new Date(),
        },
      });

      expect(updated.status).toBe('read');
      expect(updated.readAt).not.toBeNull();
    });

    it('should handle WhatsApp failure', async () => {
      const failedMsgId = '00000000-0000-4000-8000-000000009999';

      const message = await prisma.whatsAppMessage.create({
        data: {
          id: failedMsgId,
          interviewId: TEST_IDS.interview1,
          candidatePhone: '+0000000000',
          status: 'failed',
          failedAt: new Date(),
          errorMessage: 'Invalid phone number',
        },
      });

      expect(message.status).toBe('failed');
      expect(message.errorMessage).toBe('Invalid phone number');

      // Cleanup
      await prisma.whatsAppMessage.delete({ where: { id: failedMsgId } });
    });

    it('should find WhatsApp message by messageId', async () => {
      const message = await prisma.whatsAppMessage.findUnique({
        where: { messageId: 'wa-msg-67890' },
      });

      expect(message).not.toBeNull();
      expect(message?.id).toBe(tempWhatsAppId);
    });

    it('should include interview relation', async () => {
      const message = await prisma.whatsAppMessage.findUnique({
        where: { id: tempWhatsAppId },
        include: { interview: true },
      });

      expect(message?.interview).not.toBeNull();
      expect(message?.interview.id).toBe(TEST_IDS.interview1);
    });

    it('should get WhatsApp messages for interview', async () => {
      const messages = await prisma.whatsAppMessage.findMany({
        where: { interviewId: TEST_IDS.interview1 },
      });

      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Webhook Status Aggregations', () => {
    it('should count emails by status', async () => {
      const counts = await prisma.emailMessage.groupBy({
        by: ['status'],
        _count: true,
      });

      expect(Array.isArray(counts)).toBe(true);
    });

    it('should count WhatsApp messages by status', async () => {
      const counts = await prisma.whatsAppMessage.groupBy({
        by: ['status'],
        _count: true,
      });

      expect(Array.isArray(counts)).toBe(true);
    });
  });
});
