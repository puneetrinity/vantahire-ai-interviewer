/**
 * API Client
 * Replaces Supabase client with direct API calls to Hono backend
 * Authentication is handled via httpOnly cookies (session) or X-Interview-Token header
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Store interview token for candidate access
let interviewToken: string | null = null;

export function setInterviewToken(token: string | null) {
  interviewToken = token;
}

export function getInterviewToken(): string | null {
  return interviewToken;
}

// ─────────────────────────────────────────────────────────────────
// Base fetch wrapper with credentials and error handling
// ─────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  details?: unknown;
  status: number;
}

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    ...options.headers,
  };

  // Add interview token if present (for candidate routes)
  if (interviewToken) {
    (headers as Record<string, string>)['X-Interview-Token'] = interviewToken;
  }

  // Add Content-Type for JSON bodies (skip for FormData)
  if (options.body && !(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies for session auth
  });

  // Handle non-JSON responses
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    if (!response.ok) {
      throw new ApiRequestError(
        `Request failed: ${response.statusText}`,
        response.status
      );
    }
    return {} as T;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiRequestError(
      data.error || 'Request failed',
      response.status,
      data.details
    );
  }

  return data as T;
}

// ─────────────────────────────────────────────────────────────────
// Auth API
// ─────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: 'RECRUITER' | 'CANDIDATE' | 'ADMIN';
  fullName: string | null;
  avatarUrl: string | null;
}

export const auth = {
  /** Get current authenticated user */
  async getUser(): Promise<User | null> {
    try {
      return await request<User>('/auth/me');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        return null;
      }
      throw error;
    }
  },

  /** Initiate Google OAuth flow */
  loginWithGoogle(): void {
    window.location.href = `${API_URL}/auth/google`;
  },

  /** Initiate LinkedIn OAuth flow */
  loginWithLinkedIn(): void {
    window.location.href = `${API_URL}/auth/linkedin`;
  },

  /** Logout and clear session */
  async logout(): Promise<void> {
    await request('/auth/logout', { method: 'POST' });
  },
};

// ─────────────────────────────────────────────────────────────────
// Users API (profiles)
// ─────────────────────────────────────────────────────────────────

export interface RecruiterProfile {
  id: string;
  userId: string;
  companyName: string | null;
  logoFileId: string | null;
  brandColor: string | null;
  emailIntro: string | null;
  emailTips: string | null;
  emailCtaText: string | null;
  subscriptionStatus: 'FREE' | 'PAID' | 'ENTERPRISE';
}

export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  skills: string[];
  experienceYears: number | null;
  resumeFileId: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

export const users = {
  /** Get current user's recruiter profile */
  async getRecruiterProfile(): Promise<RecruiterProfile | null> {
    try {
      return await request<RecruiterProfile>('/users/recruiter-profile');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /** Update recruiter profile */
  async updateRecruiterProfile(
    data: Partial<Omit<RecruiterProfile, 'id' | 'userId'>>
  ): Promise<RecruiterProfile> {
    return request<RecruiterProfile>('/users/recruiter-profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Get current user's candidate profile */
  async getCandidateProfile(): Promise<CandidateProfile | null> {
    try {
      return await request<CandidateProfile>('/users/candidate-profile');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /** Update candidate profile */
  async updateCandidateProfile(
    data: Partial<Omit<CandidateProfile, 'id' | 'userId'>>
  ): Promise<CandidateProfile> {
    return request<CandidateProfile>('/users/candidate-profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Upload company logo */
  async uploadLogo(file: File): Promise<{ logoFileId: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return request('/users/recruiter-profile/logo', {
      method: 'POST',
      body: formData,
    });
  },

  /** Delete company logo */
  async deleteLogo(): Promise<void> {
    await request('/users/recruiter-profile/logo', { method: 'DELETE' });
  },

  /** Improve email copy with AI */
  async improveEmailCopy(params: {
    currentIntro?: string | null;
    currentTips?: string | null;
    currentCta?: string | null;
    companyName?: string | null;
    tone?: string;
  }): Promise<{
    intro: string;
    tips: string;
    cta: string;
  }> {
    const result = await request<{ improved: { intro: string; tips: string; cta: string } }>(
      '/users/improve-email-copy',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return result.improved;
  },

  // API Keys management
  apiKeys: {
    /** List API keys */
    async list(): Promise<Array<{
      id: string;
      name: string;
      keyPrefix: string;
      status: 'active' | 'revoked';
      createdAt: string;
      lastRequestAt: string | null;
      requestsToday: number;
      rateLimitPerDay: number;
      expiresAt: string | null;
    }>> {
      return request('/users/api-keys');
    },

    /** Create API key */
    async create(name: string): Promise<{
      id: string;
      key: string;
      name: string;
    }> {
      return request('/users/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },

    /** Revoke API key */
    async revoke(id: string): Promise<void> {
      await request(`/users/api-keys/${id}`, { method: 'DELETE' });
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// Interviews API
// ─────────────────────────────────────────────────────────────────

export interface Interview {
  id: string;
  recruiterId: string;
  jobId: string | null;
  candidateEmail: string;
  candidateName: string | null;
  candidateNotes: string | null;
  candidateResumeFileId: string | null;
  jobRole: string;
  type: 'TEXT' | 'VOICE';
  timeLimitMinutes: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
  interviewUrl: string | null;
  expiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  transcriptSummary: string | null;
  recordingGcsKey: string | null;
  createdAt: string;
  updatedAt: string;
  job?: { id: string; title: string } | null;
  _count?: { messages: number };
}

export interface InterviewMessage {
  id: string;
  interviewId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface CreateInterviewData {
  candidateEmail: string;
  candidateName?: string;
  candidatePhone?: string;
  candidateNotes?: string;
  candidateResumeFileId?: string;
  jobId?: string;
  jobRole: string;
  type?: 'TEXT' | 'VOICE';
  timeLimitMinutes?: number;
  expiresAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const interviews = {
  /** List interviews (recruiter) */
  async list(params?: {
    page?: number;
    limit?: number;
    status?: Interview['status'];
  }): Promise<PaginatedResponse<Interview>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return request<PaginatedResponse<Interview>>(
      `/interviews${query ? `?${query}` : ''}`
    );
  },

  /** Get single interview (recruiter) */
  async get(id: string): Promise<Interview & { messages: InterviewMessage[] }> {
    return request<Interview & { messages: InterviewMessage[] }>(
      `/interviews/${id}`
    );
  },

  /** Create interview */
  async create(data: CreateInterviewData): Promise<Interview> {
    return request<Interview>('/interviews', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Update interview */
  async update(
    id: string,
    data: Partial<Pick<Interview, 'candidateName' | 'candidateNotes' | 'timeLimitMinutes'>>
  ): Promise<Interview> {
    return request<Interview>(`/interviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Delete interview */
  async delete(id: string): Promise<void> {
    await request(`/interviews/${id}`, { method: 'DELETE' });
  },

  /** Send email invitation */
  async sendEmailInvite(id: string): Promise<{ messageId: string }> {
    return request<{ success: boolean; messageId: string }>(
      `/interviews/${id}/invite/email`,
      { method: 'POST' }
    );
  },

  /** Send WhatsApp invitation */
  async sendWhatsAppInvite(
    id: string,
    phone: string
  ): Promise<{ messageId: string }> {
    return request<{ success: boolean; messageId: string }>(
      `/interviews/${id}/invite/whatsapp`,
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }
    );
  },

  /** Get recording download URL */
  async getRecordingUrl(id: string): Promise<string> {
    const result = await request<{ downloadUrl: string }>(
      `/interviews/${id}/recording`
    );
    return result.downloadUrl;
  },

  /** Get interview transcript messages */
  async getTranscript(id: string): Promise<InterviewMessage[]> {
    return request<InterviewMessage[]>(`/interviews/${id}/transcript`);
  },

  /** Regenerate AI summary */
  async regenerateSummary(id: string): Promise<{ success: boolean }> {
    return request(`/interviews/${id}/regenerate-summary`, { method: 'POST' });
  },

  /** Transcribe video recording */
  async transcribeRecording(id: string): Promise<{
    success: boolean;
    transcription: string;
    detailed: Array<{
      speaker: string;
      text: string;
      startTime: number;
      endTime: number;
    }>;
  }> {
    return request(`/interviews/${id}/transcribe`, { method: 'POST' });
  },

  /** Generate final AI recommendation */
  async generateFinalRecommendation(
    id: string,
    params: {
      videoTranscription?: string;
      chatTranscript?: string;
    }
  ): Promise<{
    recommendation: {
      overallAssessment: string;
      hiringRecommendation: string;
      confidenceScore: number;
      keyFindings: {
        consistencies: string[];
        discrepancies: string[];
      };
      communicationAnalysis: {
        clarity: number;
        confidence: number;
        professionalTone: number;
        observations: string[];
      };
      technicalAssessment: {
        score: number;
        strengths: string[];
        gaps: string[];
      };
      cultureFitIndicators: string[];
      redFlags: string[];
      greenFlags: string[];
      finalVerdict: string;
      suggestedNextSteps: string[];
    };
  }> {
    return request(`/interviews/${id}/final-recommendation`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /** Share interview summary via email */
  async shareSummary(
    id: string,
    params: {
      recipientEmail: string;
      includeVideo?: boolean;
    }
  ): Promise<{ success: boolean }> {
    return request(`/interviews/${id}/share`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /** List screenshots for an interview */
  async listScreenshots(id: string): Promise<Array<{
    id: string;
    name: string;
    url: string;
    createdAt: string;
  }>> {
    return request(`/interviews/${id}/screenshots`);
  },

  // ─────────────────────────────────────────────────────────────
  // Logged-in candidate routes (for candidate dashboard, uses cookie auth)
  // ─────────────────────────────────────────────────────────────

  /** List interviews for the logged-in candidate */
  async listMine(params?: {
    page?: number;
    limit?: number;
    status?: Interview['status'];
  }): Promise<PaginatedResponse<Interview>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return request<PaginatedResponse<Interview>>(
      `/interviews/mine${query ? `?${query}` : ''}`
    );
  },

  // ─────────────────────────────────────────────────────────────
  // Candidate routes (require interview token)
  // ─────────────────────────────────────────────────────────────

  candidate: {
    /** Get current interview (as candidate) */
    async getCurrent(): Promise<{
      id: string;
      jobRole: string;
      type: 'TEXT' | 'VOICE';
      timeLimitMinutes: number;
      status: Interview['status'];
      startedAt: string | null;
    }> {
      return request('/interviews/candidate/current');
    },

    /** Start interview (as candidate) */
    async start(): Promise<{ status: string; startedAt: string }> {
      return request('/interviews/candidate/start', { method: 'POST' });
    },

    /** Send message in text interview (as candidate) */
    async sendMessage(content: string): Promise<{
      userMessage: { role: string; content: string };
      aiMessage: { role: string; content: string };
    }> {
      return request('/interviews/candidate/message', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    },

    /** Complete interview (as candidate) */
    async complete(): Promise<{ status: string; completedAt: string }> {
      return request('/interviews/candidate/complete', { method: 'POST' });
    },

    /** Get messages (as candidate) */
    async getMessages(): Promise<InterviewMessage[]> {
      return request('/interviews/candidate/messages');
    },

    /** Get upload URL for recording (candidate with token) */
    async getUploadUrl(interviewId: string, contentType?: string): Promise<{
      uploadUrl: string;
      gcsKey: string;
    }> {
      return request(`/interviews/${interviewId}/recording/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ contentType }),
      });
    },

    /** Save recording after upload (candidate with token) */
    async saveRecording(interviewId: string, gcsKey: string): Promise<void> {
      await request(`/interviews/${interviewId}/recording/complete`, {
        method: 'POST',
        body: JSON.stringify({ gcsKey }),
      });
    },

    /** Save a message to the interview transcript (candidate with token) */
    async saveMessage(
      role: 'user' | 'assistant',
      content: string
    ): Promise<{ id: string }> {
      return request('/interviews/candidate/messages', {
        method: 'POST',
        body: JSON.stringify({ role, content }),
      });
    },

    /** Upload a file for the interview (screenshot, document) */
    async uploadFile(
      interviewId: string,
      file: Blob,
      type: 'screenshot' | 'document',
      filename: string
    ): Promise<{ gcsKey: string }> {
      const formData = new FormData();
      formData.append('file', file, filename);
      formData.append('type', type);

      return request(`/interviews/${interviewId}/files`, {
        method: 'POST',
        body: formData,
      });
    },

    /** Update candidate notes */
    async updateNotes(notes: string): Promise<void> {
      await request('/interviews/candidate/notes', {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
    },

    /** Upload resume file */
    async uploadResume(
      interviewId: string,
      file: File
    ): Promise<{ resumeFileId: string }> {
      const formData = new FormData();
      formData.append('file', file);

      return request(`/interviews/${interviewId}/resume`, {
        method: 'POST',
        body: formData,
      });
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// Jobs API
// ─────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  recruiterId: string;
  title: string;
  description: string | null;
  department: string | null;
  location: string | null;
  jobType: string | null;
  salaryRange: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  recruiter?: {
    recruiterProfile?: {
      companyName: string | null;
      logoFileId: string | null;
    } | null;
  };
  _count?: { applications: number };
}

export interface CreateJobData {
  title: string;
  description?: string;
  department?: string;
  location?: string;
  jobType?: string;
  salaryRange?: string;
}

export const jobs = {
  /** List recruiter's jobs */
  async list(params?: {
    page?: number;
    limit?: number;
    status?: Job['status'];
  }): Promise<PaginatedResponse<Job>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return request<PaginatedResponse<Job>>(`/jobs${query ? `?${query}` : ''}`);
  },

  /** List public (approved, active) jobs */
  async listPublic(): Promise<Job[]> {
    return request<Job[]>('/jobs/public');
  },

  /** Get single job */
  async get(id: string): Promise<Job> {
    return request<Job>(`/jobs/${id}`);
  },

  /** Create job */
  async create(data: CreateJobData): Promise<Job> {
    return request<Job>('/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Update job */
  async update(id: string, data: Partial<CreateJobData>): Promise<Job> {
    return request<Job>(`/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Delete job */
  async delete(id: string): Promise<void> {
    await request(`/jobs/${id}`, { method: 'DELETE' });
  },

  /** Publish job (set status to ACTIVE) */
  async publish(id: string): Promise<Job> {
    return request<Job>(`/jobs/${id}/publish`, { method: 'POST' });
  },
};

// ─────────────────────────────────────────────────────────────────
// Applications API
// ─────────────────────────────────────────────────────────────────

export interface JobApplication {
  id: string;
  jobId: string;
  candidateId: string;
  coverLetter: string | null;
  resumeFileId: string | null;
  notes: string | null;
  status: 'PENDING' | 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' | 'HIRED';
  reviewedAt: string | null;
  appliedAt: string;
  updatedAt: string;
  job?: Job;
}

export interface CreateApplicationData {
  jobId: string;
  coverLetter?: string;
  resumeFileId?: string;
}

export interface ApplicationWithDetails extends JobApplication {
  job?: {
    id: string;
    title: string;
    department: string | null;
    location: string | null;
  } | null;
  candidate?: {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    bio: string | null;
    skills: string[];
    experienceYears: number | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
  } | null;
}

export const applications = {
  /** List all applications for recruiter's jobs (with job and candidate details) */
  async list(params?: {
    page?: number;
    limit?: number;
    status?: JobApplication['status'];
    jobId?: string;
  }): Promise<PaginatedResponse<ApplicationWithDetails>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.jobId) searchParams.set('jobId', params.jobId);

    const query = searchParams.toString();
    return request<PaginatedResponse<ApplicationWithDetails>>(
      `/applications${query ? `?${query}` : ''}`
    );
  },

  /** List applications for a job (recruiter) */
  async listForJob(
    jobId: string,
    params?: { page?: number; limit?: number; status?: JobApplication['status'] }
  ): Promise<PaginatedResponse<JobApplication>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return request<PaginatedResponse<JobApplication>>(
      `/applications/job/${jobId}${query ? `?${query}` : ''}`
    );
  },

  /** Get application (recruiter) */
  async get(id: string): Promise<JobApplication> {
    return request<JobApplication>(`/applications/${id}`);
  },

  /** Update application status (recruiter) */
  async updateStatus(
    id: string,
    status: JobApplication['status']
  ): Promise<JobApplication> {
    return request<JobApplication>(`/applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  /** Update recruiter notes on application */
  async updateNotes(id: string, notes: string): Promise<JobApplication> {
    return request<JobApplication>(`/applications/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    });
  },

  // Candidate routes
  mine: {
    /** List my applications (candidate) */
    async list(params?: {
      page?: number;
      limit?: number;
      status?: JobApplication['status'];
    }): Promise<PaginatedResponse<JobApplication>> {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.status) searchParams.set('status', params.status);

      const query = searchParams.toString();
      return request<PaginatedResponse<JobApplication>>(
        `/applications/mine${query ? `?${query}` : ''}`
      );
    },

    /** Get my application */
    async get(id: string): Promise<JobApplication> {
      return request<JobApplication>(`/applications/mine/${id}`);
    },

    /** Apply to job */
    async apply(data: CreateApplicationData): Promise<JobApplication> {
      return request<JobApplication>('/applications', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /** Update my application (only if still pending) */
    async update(
      id: string,
      data: { coverLetter?: string; notes?: string }
    ): Promise<JobApplication> {
      return request<JobApplication>(`/applications/mine/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    /** Withdraw application */
    async withdraw(id: string): Promise<void> {
      await request(`/applications/mine/${id}`, { method: 'DELETE' });
    },
  },

  // Admin routes
  admin: {
    /** List all applications (admin only) */
    async list(params?: {
      page?: number;
      limit?: number;
      status?: JobApplication['status'];
      jobId?: string;
    }): Promise<PaginatedResponse<JobApplication>> {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.status) searchParams.set('status', params.status);
      if (params?.jobId) searchParams.set('jobId', params.jobId);

      const query = searchParams.toString();
      return request<PaginatedResponse<JobApplication>>(
        `/applications/admin/all${query ? `?${query}` : ''}`
      );
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// Files API
// ─────────────────────────────────────────────────────────────────

export type FileCategory = 'LOGO' | 'RESUME' | 'SCREENSHOT' | 'DOCUMENT';
export type FilePurpose =
  | 'recruiter_logo'
  | 'profile_resume'
  | 'interview_resume'
  | 'application_resume'
  | 'interview_attachment'
  | 'application_attachment';

export interface FileUploadResult {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: FileCategory;
  purpose: FilePurpose;
  url: string;
}

export const files = {
  /** Upload a file */
  async upload(
    file: File,
    params: {
      category: FileCategory;
      purpose: FilePurpose;
      interviewId?: string;
      jobApplicationId?: string;
    }
  ): Promise<FileUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', params.category);
    formData.append('purpose', params.purpose);
    if (params.interviewId) {
      formData.append('interviewId', params.interviewId);
    }
    if (params.jobApplicationId) {
      formData.append('jobApplicationId', params.jobApplicationId);
    }

    return request<FileUploadResult>('/files', {
      method: 'POST',
      body: formData,
    });
  },

  /** Get file URL */
  getUrl(fileId: string): string {
    return `${API_URL}/files/${fileId}`;
  },

  /** Get signed URL for a file (recordings, etc.) */
  async getSignedUrl(
    fileId: string,
    expiresInSeconds?: number
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    const params = expiresInSeconds ? `?expiresIn=${expiresInSeconds}` : '';
    return request(`/files/${fileId}/signed${params}`);
  },

  /** Delete a file */
  async delete(fileId: string): Promise<void> {
    await request(`/files/${fileId}`, { method: 'DELETE' });
  },
};

// ─────────────────────────────────────────────────────────────────
// Notifications API
// ─────────────────────────────────────────────────────────────────

export interface EmailMessage {
  id: string;
  interviewId: string;
  recipientEmail: string;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
}

export interface WhatsAppMessage {
  id: string;
  interviewId: string;
  candidatePhone: string;
  messageId: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
}

export const notifications = {
  /** Get email messages for interviews */
  async getEmailStatus(interviewIds: string[]): Promise<Record<string, EmailMessage>> {
    if (interviewIds.length === 0) return {};
    return request<Record<string, EmailMessage>>('/notifications/email/status', {
      method: 'POST',
      body: JSON.stringify({ interviewIds }),
    });
  },

  /** Get WhatsApp messages for interviews */
  async getWhatsAppStatus(interviewIds: string[]): Promise<Record<string, WhatsAppMessage>> {
    if (interviewIds.length === 0) return {};
    return request<Record<string, WhatsAppMessage>>('/notifications/whatsapp/status', {
      method: 'POST',
      body: JSON.stringify({ interviewIds }),
    });
  },
};

// ─────────────────────────────────────────────────────────────────
// Admin API
// ─────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalRecruiters: number;
  totalCandidates: number;
  totalJobs: number;
  pendingJobs: number;
  totalInterviews: number;
  completedInterviews: number;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: 'RECRUITER' | 'CANDIDATE' | 'ADMIN';
  createdAt: string;
  lastLoginAt: string | null;
  recruiterProfile?: {
    companyName: string | null;
    subscriptionStatus: string;
  } | null;
}

export interface AdminSettings {
  id: string;
  secretSignupCode: string | null;
  maxInterviewsPerRecruiter: number;
  defaultInterviewDuration: number;
  enableEmailNotifications: boolean;
  enableWhatsAppNotifications: boolean;
  maintenanceMode: boolean;
}

export const admin = {
  /** Get admin dashboard stats */
  async getStats(): Promise<AdminStats> {
    return request<AdminStats>('/admin/stats');
  },

  /** List all users (admin only) */
  async listUsers(params?: {
    page?: number;
    limit?: number;
    role?: 'RECRUITER' | 'CANDIDATE' | 'ADMIN';
    search?: string;
  }): Promise<PaginatedResponse<AdminUser>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.role) searchParams.set('role', params.role);
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return request<PaginatedResponse<AdminUser>>(
      `/admin/users${query ? `?${query}` : ''}`
    );
  },

  /** Get single user (admin only) */
  async getUser(id: string): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}`);
  },

  /** Update user role (admin only) */
  async updateUserRole(
    id: string,
    role: 'RECRUITER' | 'CANDIDATE' | 'ADMIN'
  ): Promise<AdminUser> {
    return request<AdminUser>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  /** Delete user (admin only) */
  async deleteUser(id: string): Promise<void> {
    await request(`/admin/users/${id}`, { method: 'DELETE' });
  },

  /** List all jobs (admin only) */
  async listJobs(params?: {
    page?: number;
    limit?: number;
    status?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
    approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  }): Promise<PaginatedResponse<Job>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.approvalStatus) searchParams.set('approvalStatus', params.approvalStatus);

    const query = searchParams.toString();
    return request<PaginatedResponse<Job>>(`/admin/jobs${query ? `?${query}` : ''}`);
  },

  /** Approve job (admin only) */
  async approveJob(id: string): Promise<Job> {
    return request<Job>(`/admin/jobs/${id}/approve`, { method: 'POST' });
  },

  /** Reject job (admin only) */
  async rejectJob(id: string, reason: string): Promise<Job> {
    return request<Job>(`/admin/jobs/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /** List all interviews (admin only) */
  async listInterviews(params?: {
    page?: number;
    limit?: number;
    status?: Interview['status'];
  }): Promise<PaginatedResponse<Interview>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return request<PaginatedResponse<Interview>>(
      `/admin/interviews${query ? `?${query}` : ''}`
    );
  },

  /** Get admin settings */
  async getSettings(): Promise<AdminSettings> {
    return request<AdminSettings>('/admin/settings');
  },

  /** Get analytics data for dashboard */
  async getAnalytics(days?: number): Promise<{
    dailyStats: Array<{
      date: string;
      interviews: number;
      signups: number;
      jobs: number;
    }>;
    interviewStatusDistribution: Array<{
      name: string;
      value: number;
    }>;
  }> {
    const params = days ? `?days=${days}` : '';
    return request(`/admin/analytics${params}`);
  },

  /** Get overview data for dashboard */
  async getOverview(): Promise<{
    recentJobs: Array<{
      id: string;
      title: string;
      status: string;
      createdAt: string;
      recruiterName?: string;
    }>;
    recentInterviews: Array<{
      id: string;
      jobRole: string;
      candidateName: string | null;
      candidateEmail: string;
      status: string;
      score: number | null;
      createdAt: string;
    }>;
    recentCandidates: Array<{
      id: string;
      fullName: string | null;
      email: string | null;
      createdAt: string;
    }>;
    stats: {
      totalJobs: number;
      activeJobs: number;
      totalInterviews: number;
      completedInterviews: number;
      totalCandidates: number;
      totalRecruiters: number;
    };
  }> {
    return request('/admin/overview');
  },

  /** Update admin settings */
  async updateSettings(
    data: Partial<Omit<AdminSettings, 'id'>>
  ): Promise<AdminSettings> {
    return request<AdminSettings>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

// ─────────────────────────────────────────────────────────────────
// Utility exports
// ─────────────────────────────────────────────────────────────────

export { API_URL };
