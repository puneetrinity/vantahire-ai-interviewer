import type { UserRole, Interview } from '@prisma/client';

// Authenticated user attached to context
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

// Interview session data (for candidate token access)
export interface InterviewSession {
  sessionId: string;
  interviewId: string;
  interview: Interview;
  token: string;
}

// Hono environment type for context variables
export type AppEnv = {
  Variables: {
    user: AuthUser;
    interviewSession: InterviewSession;
  };
};

// Interview session token (for candidate access)
export interface InterviewSessionData {
  interviewId: string;
  candidateEmail: string;
}

// API error response
export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Pagination params
export interface PaginationParams {
  page: number;
  limit: number;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// File upload metadata
export interface FileUpload {
  name: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

// Voice pipeline config
export interface VoiceConfig {
  sttProvider: 'deepgram';
  ttsProvider: 'deepgram' | 'cartesia';
  llmProvider: 'groq';
}

// Interview AI context
export interface InterviewContext {
  jobRole: string;
  jobDescription?: string;
  candidateName?: string;
  candidateResume?: string;
  previousMessages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}
