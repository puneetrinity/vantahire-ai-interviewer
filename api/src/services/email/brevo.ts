/**
 * Brevo (formerly Sendinblue) Email Service
 * Sends interview invitations and updates EmailMessage records
 */

import { config } from '../../lib/config.js';
import { db } from '../../lib/db.js';
import { emitTo } from '../../lib/socket.js';

export interface SendEmailParams {
  interviewId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  emailMessageId?: string;
  error?: string;
}

/**
 * Send an email via Brevo API
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { interviewId, recipientEmail, recipientName, subject, htmlContent, textContent } = params;

  if (!config.BREVO_API_KEY || !config.BREVO_SENDER_EMAIL) {
    console.warn('Brevo not configured, skipping email send');
    return { success: false, error: 'Email service not configured' };
  }

  // Create pending EmailMessage record
  const emailMessage = await db.emailMessage.create({
    data: {
      interviewId,
      recipientEmail,
      status: 'pending',
    },
  });

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: config.BREVO_SENDER_EMAIL,
          name: config.BREVO_SENDER_NAME,
        },
        to: [{
          email: recipientEmail,
          name: recipientName || recipientEmail,
        }],
        subject,
        htmlContent,
        textContent: textContent || htmlContent.replace(/<[^>]*>/g, ''),
        // Tag for webhook filtering
        tags: ['interview-invite'],
        // Headers for tracking
        headers: {
          'X-Interview-Id': interviewId,
          'X-Email-Message-Id': emailMessage.id,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Brevo API error: ${response.status} ${errorBody}`);
    }

    const result = await response.json() as { messageId: string };

    // Update with message ID and sent status
    await db.emailMessage.update({
      where: { id: emailMessage.id },
      data: {
        messageId: result.messageId,
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
      emitTo.user(interview.recruiterId, 'email:sent', {
        interviewId,
        messageId: result.messageId,
      });
    }

    return {
      success: true,
      messageId: result.messageId,
      emailMessageId: emailMessage.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to send email:', errorMessage);

    // Update record with failure
    await db.emailMessage.update({
      where: { id: emailMessage.id },
      data: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage,
      },
    });

    return {
      success: false,
      emailMessageId: emailMessage.id,
      error: errorMessage,
    };
  }
}

/**
 * Send interview invitation email
 */
export async function sendInterviewInvite(
  interviewId: string,
  interviewUrl: string
): Promise<SendEmailResult> {
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
  const emailIntro = interview.recruiter.recruiterProfile?.emailIntro
    || `You've been invited to complete an interview for the ${interview.jobRole} position.`;
  const emailTips = interview.recruiter.recruiterProfile?.emailTips
    || 'Take your time and answer thoughtfully. There are no right or wrong answers.';
  const ctaText = interview.recruiter.recruiterProfile?.emailCtaText || 'Start Interview';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #2563eb; margin-bottom: 5px;">${companyName}</h1>
    <p style="color: #6b7280; font-size: 14px;">Interview Invitation</p>
  </div>

  <p>Hi${interview.candidateName ? ` ${interview.candidateName}` : ''},</p>

  <p>${emailIntro}</p>

  <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Position:</strong> ${interview.jobRole}</p>
    <p style="margin: 0 0 10px 0;"><strong>Type:</strong> ${interview.type === 'VOICE' ? 'Voice Interview' : 'Text Interview'}</p>
    <p style="margin: 0;"><strong>Duration:</strong> ~${interview.timeLimitMinutes} minutes</p>
  </div>

  <p><strong>Tips:</strong></p>
  <p style="color: #6b7280;">${emailTips}</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${interviewUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">${ctaText}</a>
  </div>

  <p style="color: #6b7280; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="word-break: break-all; font-size: 14px;"><a href="${interviewUrl}">${interviewUrl}</a></p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    This email was sent by ${companyName} via VantaHire.<br>
    If you didn't expect this email, you can safely ignore it.
  </p>
</body>
</html>
  `.trim();

  return sendEmail({
    interviewId,
    recipientEmail: interview.candidateEmail,
    recipientName: interview.candidateName || undefined,
    subject: `Interview Invitation: ${interview.jobRole} at ${companyName}`,
    htmlContent,
  });
}

/**
 * Handle Brevo webhook events
 */
export async function handleBrevoWebhook(event: BrevoWebhookEvent): Promise<void> {
  const { messageId, event: eventType, date } = event;

  if (!messageId) {
    console.warn('Brevo webhook missing messageId');
    return;
  }

  // Find the email message
  const emailMessage = await db.emailMessage.findUnique({
    where: { messageId },
    include: {
      interview: {
        select: { id: true, recruiterId: true },
      },
    },
  });

  if (!emailMessage) {
    console.warn(`EmailMessage not found for messageId: ${messageId}`);
    return;
  }

  const eventDate = new Date(date);
  const interviewId = emailMessage.interviewId;
  const recruiterId = emailMessage.interview.recruiterId;

  switch (eventType) {
    case 'delivered':
      await db.emailMessage.update({
        where: { id: emailMessage.id },
        data: { status: 'delivered', deliveredAt: eventDate },
      });
      emitTo.user(recruiterId, 'email:delivered', { interviewId, messageId });
      break;

    case 'opened':
    case 'unique_opened':
      await db.emailMessage.update({
        where: { id: emailMessage.id },
        data: { status: 'opened', openedAt: eventDate },
      });
      emitTo.user(recruiterId, 'email:opened', { interviewId, messageId });
      break;

    case 'hard_bounce':
    case 'soft_bounce':
    case 'blocked':
    case 'invalid_email':
      await db.emailMessage.update({
        where: { id: emailMessage.id },
        data: {
          status: 'bounced',
          bouncedAt: eventDate,
          errorMessage: eventType,
        },
      });
      emitTo.user(recruiterId, 'email:bounced', {
        interviewId,
        messageId,
        error: eventType,
      });
      break;

    case 'spam':
    case 'unsubscribed':
      await db.emailMessage.update({
        where: { id: emailMessage.id },
        data: {
          status: eventType,
          errorMessage: eventType,
        },
      });
      break;

    default:
      console.log(`Unhandled Brevo event type: ${eventType}`);
  }
}

// Brevo webhook event types
export interface BrevoWebhookEvent {
  event: 'request' | 'delivered' | 'opened' | 'unique_opened' | 'click'
    | 'hard_bounce' | 'soft_bounce' | 'blocked' | 'spam' | 'invalid_email' | 'unsubscribed';
  messageId: string;
  email: string;
  date: string;
  ts?: number;
  subject?: string;
  tag?: string;
  'X-Interview-Id'?: string;
  'X-Email-Message-Id'?: string;
}
