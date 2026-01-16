import cron from 'node-cron';
import { db } from '../lib/db.js';
import { emitTo } from '../lib/socket.js';

/**
 * Start all scheduled jobs
 */
export function startScheduledJobs() {
  console.log('Starting scheduled jobs...');

  // Expire stale interviews - runs every 15 minutes
  cron.schedule('*/15 * * * *', expireStaleInterviews);

  // Clean up expired interview sessions - runs every hour
  cron.schedule('0 * * * *', cleanupExpiredSessions);

  // Reset daily API rate limits - runs at midnight UTC
  cron.schedule('0 0 * * *', resetApiRateLimits);

  console.log('Scheduled jobs started');
}

/**
 * Expire interviews that have exceeded their time limit
 */
async function expireStaleInterviews() {
  console.log('Running: expireStaleInterviews');

  try {
    const now = new Date();

    // Find in-progress interviews that started more than their time limit ago
    const staleInterviews = await db.interview.findMany({
      where: {
        status: 'IN_PROGRESS',
        startedAt: { not: null },
      },
    });

    for (const interview of staleInterviews) {
      if (!interview.startedAt) continue;

      const elapsedMinutes = (now.getTime() - interview.startedAt.getTime()) / (1000 * 60);

      if (elapsedMinutes > interview.timeLimitMinutes + 5) {
        // 5 min grace period
        await db.interview.update({
          where: { id: interview.id },
          data: {
            status: 'EXPIRED',
            completedAt: now,
          },
        });

        // Notify recruiter
        emitTo.user(interview.recruiterId, 'interview:status', {
          interviewId: interview.id,
          status: 'EXPIRED',
        });

        console.log(`Expired interview: ${interview.id}`);
      }
    }

    // Also expire pending interviews past their expiresAt date
    await db.interview.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });
  } catch (error) {
    console.error('Error in expireStaleInterviews:', error);
  }
}

/**
 * Clean up expired interview sessions (tokens)
 * We don't delete them, just ensure they're not usable
 */
async function cleanupExpiredSessions() {
  console.log('Running: cleanupExpiredSessions');

  try {
    const now = new Date();

    // Count expired sessions for logging
    const expiredCount = await db.interviewSession.count({
      where: {
        expiresAt: { lt: now },
        revokedAt: null,
      },
    });

    console.log(`Found ${expiredCount} expired sessions`);

    // Optionally: delete very old sessions (older than 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { count } = await db.interviewSession.deleteMany({
      where: {
        expiresAt: { lt: thirtyDaysAgo },
      },
    });

    if (count > 0) {
      console.log(`Deleted ${count} old sessions`);
    }
  } catch (error) {
    console.error('Error in cleanupExpiredSessions:', error);
  }
}

/**
 * Reset daily API rate limits at midnight
 */
async function resetApiRateLimits() {
  console.log('Running: resetApiRateLimits');

  try {
    const { count } = await db.apiKey.updateMany({
      where: {
        status: 'ACTIVE',
        requestsToday: { gt: 0 },
      },
      data: {
        requestsToday: 0,
        lastResetAt: new Date(),
      },
    });

    console.log(`Reset rate limits for ${count} API keys`);
  } catch (error) {
    console.error('Error in resetApiRateLimits:', error);
  }
}
