/**
 * WhatsApp Cloud API (Meta) Service
 * Sends interview invitations via WhatsApp and handles webhook events
 */

import crypto from 'crypto';
import { config } from '../../lib/config.js';
import { db } from '../../lib/db.js';
import { emitTo } from '../../lib/socket.js';

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v18.0';

export interface SendWhatsAppParams {
  interviewId: string;
  candidatePhone: string;
  templateName: string;
  templateParams: string[];
  language?: string;
}

export interface SendWhatsAppResult {
  success: boolean;
  messageId?: string;
  whatsappMessageId?: string;
  error?: string;
}

/**
 * Send a WhatsApp template message via Meta Cloud API
 */
export async function sendWhatsAppTemplate(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
  const { interviewId, candidatePhone, templateName, templateParams, language = 'en' } = params;

  if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN) {
    console.warn('WhatsApp not configured, skipping message send');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  // Normalize phone number (remove spaces, dashes, ensure starts with country code)
  const normalizedPhone = normalizePhoneNumber(candidatePhone);

  // Create pending WhatsAppMessage record
  const whatsappMessage = await db.whatsAppMessage.create({
    data: {
      interviewId,
      candidatePhone: normalizedPhone,
      status: 'pending',
    },
  });

  try {
    const url = `${WHATSAPP_API_BASE}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: [
            {
              type: 'body',
              parameters: templateParams.map(text => ({
                type: 'text',
                text,
              })),
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} ${errorBody}`);
    }

    const result = await response.json() as { messages: Array<{ id: string }> };
    const messageId = result.messages?.[0]?.id;

    if (!messageId) {
      throw new Error('No message ID returned from WhatsApp API');
    }

    // Update with message ID and sent status
    await db.whatsAppMessage.update({
      where: { id: whatsappMessage.id },
      data: {
        messageId,
        status: 'sent',
        sentAt: new Date(),
      },
    });

    // Fetch interview to get recruiter ID for socket emit
    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      select: { recruiterId: true },
    });

    if (interview) {
      emitTo.user(interview.recruiterId, 'whatsapp:sent', {
        interviewId,
        messageId,
      });
    }

    return {
      success: true,
      messageId,
      whatsappMessageId: whatsappMessage.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to send WhatsApp message:', errorMessage);

    // Update record with failure
    await db.whatsAppMessage.update({
      where: { id: whatsappMessage.id },
      data: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage,
      },
    });

    return {
      success: false,
      whatsappMessageId: whatsappMessage.id,
      error: errorMessage,
    };
  }
}

/**
 * Send interview invitation via WhatsApp
 * Requires a pre-approved template named "interview_invite" in Meta Business Manager
 */
export async function sendInterviewInviteWhatsApp(
  interviewId: string,
  candidatePhone: string,
  interviewUrl: string
): Promise<SendWhatsAppResult> {
  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    include: {
      recruiter: {
        include: {
          recruiterProfile: true,
        },
      },
    },
  });

  if (!interview) {
    return { success: false, error: 'Interview not found' };
  }

  const companyName = interview.recruiter.recruiterProfile?.companyName || 'VantaHire';

  // Template parameters: {{1}} = candidate name, {{2}} = job role, {{3}} = company, {{4}} = interview URL
  return sendWhatsAppTemplate({
    interviewId,
    candidatePhone,
    templateName: 'interview_invite',
    templateParams: [
      interview.candidateName || 'there',
      interview.jobRole,
      companyName,
      interviewUrl,
    ],
  });
}

/**
 * Handle WhatsApp webhook events (status updates)
 */
export async function handleWhatsAppWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  // Handle message status updates
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const statuses = change.value?.statuses || [];

      for (const status of statuses) {
        await processStatusUpdate(status);
      }
    }
  }
}

async function processStatusUpdate(status: WhatsAppStatusUpdate): Promise<void> {
  const { id: messageId, status: statusType, timestamp } = status;

  // Find the WhatsApp message
  const whatsappMessage = await db.whatsAppMessage.findUnique({
    where: { messageId },
    include: {
      interview: {
        select: { id: true, recruiterId: true },
      },
    },
  });

  if (!whatsappMessage) {
    console.warn(`WhatsAppMessage not found for messageId: ${messageId}`);
    return;
  }

  const eventDate = new Date(parseInt(timestamp) * 1000);
  const interviewId = whatsappMessage.interviewId;
  const recruiterId = whatsappMessage.interview.recruiterId;

  switch (statusType) {
    case 'sent':
      // Already handled on send
      break;

    case 'delivered':
      await db.whatsAppMessage.update({
        where: { id: whatsappMessage.id },
        data: { status: 'delivered', deliveredAt: eventDate },
      });
      emitTo.user(recruiterId, 'whatsapp:delivered', { interviewId, messageId });
      break;

    case 'read':
      await db.whatsAppMessage.update({
        where: { id: whatsappMessage.id },
        data: { status: 'read', readAt: eventDate },
      });
      emitTo.user(recruiterId, 'whatsapp:read', { interviewId, messageId });
      break;

    case 'failed':
      const errorMessage = status.errors?.[0]?.message || 'Unknown error';
      await db.whatsAppMessage.update({
        where: { id: whatsappMessage.id },
        data: {
          status: 'failed',
          failedAt: eventDate,
          errorMessage,
        },
      });
      emitTo.user(recruiterId, 'whatsapp:failed', {
        interviewId,
        messageId,
        error: errorMessage,
      });
      break;

    default:
      console.log(`Unhandled WhatsApp status: ${statusType}`);
  }
}

/**
 * Verify WhatsApp webhook signature
 */
export function verifyWhatsAppSignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!config.WHATSAPP_APP_SECRET || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.WHATSAPP_APP_SECRET)
    .update(payload)
    .digest('hex');

  return `sha256=${expectedSignature}` === signature;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // If doesn't start with +, assume it needs country code
  // For now, default to US (+1) if no country code provided
  if (!normalized.startsWith('+')) {
    // Remove leading 0 if present (common in some countries)
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }
    // If 10 digits, assume US number
    if (normalized.length === 10) {
      normalized = '+1' + normalized;
    } else {
      normalized = '+' + normalized;
    }
  }

  return normalized;
}

// WhatsApp webhook types
export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value?: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        statuses?: WhatsAppStatusUpdate[];
        messages?: WhatsAppIncomingMessage[];
      };
    }>;
  }>;
}

export interface WhatsAppStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'button' | 'interactive';
  text?: { body: string };
}
