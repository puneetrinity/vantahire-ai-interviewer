import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from './config.js';
import { getSession } from './redis.js';
import { db } from './db.js';

let io: Server | null = null;

// Parse cookie string into object
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
    return cookies;
  }, {} as Record<string, string>);
}

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.CLIENT_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware - supports both session cookie and interview token
  io.use(async (socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const sessionId = cookies['session'];

    // Try interview token from query (for candidate WebSocket connections)
    const interviewToken = socket.handshake.auth.interviewToken as string | undefined
      || socket.handshake.query.token as string | undefined;

    // Authenticated user via session cookie
    if (sessionId) {
      const session = await getSession(sessionId);
      if (session) {
        socket.data.userId = session.userId;
        socket.data.email = session.email;
        socket.data.role = session.role;
        socket.data.authType = 'session';
        return next();
      }
    }

    // Candidate via interview token
    if (interviewToken) {
      const interviewSession = await db.interviewSession.findUnique({
        where: { token: interviewToken },
        include: { interview: true },
      });

      if (interviewSession &&
          !interviewSession.revokedAt &&
          interviewSession.expiresAt > new Date()) {
        socket.data.interviewId = interviewSession.interviewId;
        socket.data.interviewToken = interviewToken;
        socket.data.authType = 'interviewToken';
        return next();
      }
    }

    return next(new Error('Authentication required'));
  });

  io.on('connection', (socket: Socket) => {
    const authType = socket.data.authType as string;

    if (authType === 'session') {
      const userId = socket.data.userId as string;
      // Join user's personal room for targeted updates
      socket.join(`user:${userId}`);
      console.log(`Socket connected: ${socket.id} (user: ${userId})`);
    } else if (authType === 'interviewToken') {
      const interviewId = socket.data.interviewId as string;
      // Auto-join the interview room they have access to
      socket.join(`interview:${interviewId}`);
      console.log(`Socket connected: ${socket.id} (candidate for interview: ${interviewId})`);
    }

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });

    // Join interview room - with ownership validation
    socket.on('join:interview', async (interviewId: string, callback?: (result: { success: boolean; error?: string }) => void) => {
      const respond = (result: { success: boolean; error?: string }) => {
        if (typeof callback === 'function') callback(result);
      };

      // Candidates can only join their own interview (already auto-joined)
      if (authType === 'interviewToken') {
        if (socket.data.interviewId === interviewId) {
          respond({ success: true });
        } else {
          respond({ success: false, error: 'Unauthorized' });
        }
        return;
      }

      // Authenticated users must own the interview
      const userId = socket.data.userId as string;
      const interview = await db.interview.findFirst({
        where: { id: interviewId, recruiterId: userId },
      });

      if (!interview) {
        respond({ success: false, error: 'Interview not found or unauthorized' });
        return;
      }

      socket.join(`interview:${interviewId}`);
      console.log(`Socket ${socket.id} joined interview:${interviewId}`);
      respond({ success: true });
    });

    socket.on('leave:interview', (interviewId: string) => {
      socket.leave(`interview:${interviewId}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

// Emit helpers for explicit emit points
export const emitTo = {
  // User-specific events
  user(userId: string, event: string, data: unknown): void {
    getIO().to(`user:${userId}`).emit(event, data);
  },

  // Interview room events
  interview(interviewId: string, event: string, data: unknown): void {
    getIO().to(`interview:${interviewId}`).emit(event, data);
  },
};

// Event types for type safety
export type SocketEvents = {
  // Interview events
  'interview:status': { interviewId: string; status: string };
  'interview:message': { interviewId: string; message: { role: string; content: string } };
  'interview:score': { interviewId: string; score: number; summary: string };

  // Email events
  'email:sent': { interviewId: string; messageId: string };
  'email:delivered': { interviewId: string; messageId: string };
  'email:opened': { interviewId: string; messageId: string };
  'email:bounced': { interviewId: string; messageId: string; error: string };

  // WhatsApp events
  'whatsapp:sent': { interviewId: string; messageId: string };
  'whatsapp:delivered': { interviewId: string; messageId: string };
  'whatsapp:read': { interviewId: string; messageId: string };
  'whatsapp:failed': { interviewId: string; messageId: string; error: string };

  // Job events
  'job:approved': { jobId: string };
  'job:rejected': { jobId: string; reason: string };

  // Application events
  'application:new': { applicationId: string; jobId: string; jobTitle: string };
  'application:status': { applicationId: string; jobTitle: string; status: string };
};
