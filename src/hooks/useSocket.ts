/**
 * Socket.io Client Hook
 * Provides real-time updates from the backend
 * Authenticates via httpOnly cookie (automatic) or interview token
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getInterviewToken } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Singleton socket instance
let socket: Socket | null = null;
let connectionCount = 0;

function getSocket(): Socket {
  if (!socket) {
    const interviewToken = getInterviewToken();

    socket = io(API_URL, {
      withCredentials: true, // Send cookies for session auth
      transports: ['websocket', 'polling'],
      auth: interviewToken ? { interviewToken } : undefined,
      query: interviewToken ? { token: interviewToken } : undefined,
      autoConnect: false,
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });
  }

  return socket;
}

// ─────────────────────────────────────────────────────────────────
// Main socket hook - manages connection lifecycle
// ─────────────────────────────────────────────────────────────────

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sock = getSocket();
    connectionCount++;

    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleError = (err: Error) => {
      setError(err.message);
    };

    sock.on('connect', handleConnect);
    sock.on('disconnect', handleDisconnect);
    sock.on('connect_error', handleError);

    // Connect if first subscriber
    if (connectionCount === 1) {
      sock.connect();
    }

    // Update state if already connected
    if (sock.connected) {
      setIsConnected(true);
    }

    return () => {
      sock.off('connect', handleConnect);
      sock.off('disconnect', handleDisconnect);
      sock.off('connect_error', handleError);

      connectionCount--;

      // Disconnect if last subscriber
      if (connectionCount === 0 && socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, []);

  return { isConnected, error, socket: getSocket() };
}

// ─────────────────────────────────────────────────────────────────
// Event listener hook - subscribe to specific events
// ─────────────────────────────────────────────────────────────────

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void
) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (data: T) => {
      handlerRef.current(data);
    };

    socket.on(event, listener);

    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}

// ─────────────────────────────────────────────────────────────────
// Interview room hook - join/leave interview rooms
// ─────────────────────────────────────────────────────────────────

export function useInterviewRoom(interviewId: string | null) {
  const { socket, isConnected } = useSocket();
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!interviewId || !isConnected) {
      setJoined(false);
      return;
    }

    socket.emit(
      'join:interview',
      interviewId,
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          setJoined(true);
          setJoinError(null);
        } else {
          setJoined(false);
          setJoinError(result.error || 'Failed to join interview room');
        }
      }
    );

    return () => {
      socket.emit('leave:interview', interviewId);
      setJoined(false);
    };
  }, [socket, interviewId, isConnected]);

  return { joined, joinError };
}

// ─────────────────────────────────────────────────────────────────
// Typed event hooks for common events
// ─────────────────────────────────────────────────────────────────

// Interview status updates
export interface InterviewStatusEvent {
  interviewId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
}

export function useInterviewStatus(
  handler: (data: InterviewStatusEvent) => void
) {
  useSocketEvent('interview:status', handler);
}

// Interview message updates
export interface InterviewMessageEvent {
  interviewId: string;
  message: { role: string; content: string };
}

export function useInterviewMessage(
  handler: (data: InterviewMessageEvent) => void
) {
  useSocketEvent('interview:message', handler);
}

// Interview score updates
export interface InterviewScoreEvent {
  interviewId: string;
  score: number;
  summary: string;
}

export function useInterviewScore(handler: (data: InterviewScoreEvent) => void) {
  useSocketEvent('interview:score', handler);
}

// Email status updates
export interface EmailStatusEvent {
  interviewId: string;
  messageId: string;
  error?: string;
}

export function useEmailSent(handler: (data: EmailStatusEvent) => void) {
  useSocketEvent('email:sent', handler);
}

export function useEmailDelivered(handler: (data: EmailStatusEvent) => void) {
  useSocketEvent('email:delivered', handler);
}

export function useEmailOpened(handler: (data: EmailStatusEvent) => void) {
  useSocketEvent('email:opened', handler);
}

export function useEmailBounced(handler: (data: EmailStatusEvent) => void) {
  useSocketEvent('email:bounced', handler);
}

// WhatsApp status updates
export interface WhatsAppStatusEvent {
  interviewId: string;
  messageId: string;
  error?: string;
}

export function useWhatsAppSent(handler: (data: WhatsAppStatusEvent) => void) {
  useSocketEvent('whatsapp:sent', handler);
}

export function useWhatsAppDelivered(
  handler: (data: WhatsAppStatusEvent) => void
) {
  useSocketEvent('whatsapp:delivered', handler);
}

export function useWhatsAppRead(handler: (data: WhatsAppStatusEvent) => void) {
  useSocketEvent('whatsapp:read', handler);
}

export function useWhatsAppFailed(
  handler: (data: WhatsAppStatusEvent) => void
) {
  useSocketEvent('whatsapp:failed', handler);
}

// Job events
export interface JobApprovedEvent {
  jobId: string;
}

export interface JobRejectedEvent {
  jobId: string;
  reason: string;
}

export function useJobApproved(handler: (data: JobApprovedEvent) => void) {
  useSocketEvent('job:approved', handler);
}

export function useJobRejected(handler: (data: JobRejectedEvent) => void) {
  useSocketEvent('job:rejected', handler);
}

// Application events
export interface ApplicationNewEvent {
  applicationId: string;
  jobId: string;
  jobTitle: string;
}

export interface ApplicationStatusEvent {
  applicationId: string;
  jobTitle: string;
  status: string;
}

export function useApplicationNew(handler: (data: ApplicationNewEvent) => void) {
  useSocketEvent('application:new', handler);
}

export function useApplicationStatus(
  handler: (data: ApplicationStatusEvent) => void
) {
  useSocketEvent('application:status', handler);
}

// ─────────────────────────────────────────────────────────────────
// Reconnect with new token (for candidates)
// ─────────────────────────────────────────────────────────────────

export function reconnectWithToken(token: string) {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // Token is already set via setInterviewToken in api.ts
  // Just trigger a new connection
  getSocket().connect();
}
