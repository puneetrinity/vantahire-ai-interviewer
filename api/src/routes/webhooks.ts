/**
 * Webhook Routes
 * Handles incoming webhooks from Brevo (email) and WhatsApp (Meta)
 */

import { Hono } from 'hono';
import crypto from 'crypto';
import { config } from '../lib/config.js';
import { handleBrevoWebhook, type BrevoWebhookEvent } from '../services/email/brevo.js';
import {
  handleWhatsAppWebhook,
  verifyWhatsAppSignature,
  type WhatsAppWebhookPayload,
} from '../services/whatsapp/meta.js';
import type { AppEnv } from '../types/index.js';

const app = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────
// Brevo Email Webhooks
// POST /webhooks/brevo
// ─────────────────────────────────────────────────────────────────

app.post('/brevo', async (c) => {
  const body = await c.req.text();

  // Optional: Verify webhook secret if configured
  if (config.BREVO_WEBHOOK_SECRET) {
    const signature = c.req.header('X-Brevo-Signature');

    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', config.BREVO_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('Invalid Brevo webhook signature');
        return c.json({ error: 'Invalid signature' }, 401);
      }
    }
  }

  try {
    const event = JSON.parse(body) as BrevoWebhookEvent;
    await handleBrevoWebhook(event);
    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to process Brevo webhook:', error);
    // Return 200 to prevent retries for invalid payloads
    return c.json({ success: false });
  }
});

// ─────────────────────────────────────────────────────────────────
// WhatsApp Webhooks (Meta Cloud API)
// GET /webhooks/whatsapp - Verification challenge
// POST /webhooks/whatsapp - Status updates
// ─────────────────────────────────────────────────────────────────

// Webhook verification (required by Meta)
app.get('/whatsapp', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    return c.text(challenge || '');
  }

  console.warn('WhatsApp webhook verification failed');
  return c.json({ error: 'Verification failed' }, 403);
});

// Incoming webhook events
app.post('/whatsapp', async (c) => {
  const body = await c.req.text();

  // Verify signature
  const signature = c.req.header('X-Hub-Signature-256');
  if (!verifyWhatsAppSignature(body, signature)) {
    console.warn('Invalid WhatsApp webhook signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const payload = JSON.parse(body) as WhatsAppWebhookPayload;

    // Meta requires quick acknowledgment
    // Process asynchronously if needed for complex operations
    await handleWhatsAppWebhook(payload);

    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to process WhatsApp webhook:', error);
    // Return 200 to acknowledge receipt (Meta will retry on non-2xx)
    return c.json({ success: false });
  }
});

export default app;
