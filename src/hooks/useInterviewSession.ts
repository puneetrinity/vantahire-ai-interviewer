import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  interviews,
  setInterviewToken,
  getInterviewToken,
} from '@/lib/api';
import { reconnectWithToken } from './useSocket';

interface CandidateAuthState {
  interviewId: string | null;
  token: string | null;
  interview: {
    id: string;
    jobRole: string;
    type: 'TEXT' | 'VOICE';
    timeLimitMinutes: number;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
    startedAt: string | null;
  } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

/**
 * Hook for managing candidate access via interview session token.
 * Extracts token from URL query param and validates with the API.
 *
 * @deprecated Use useInterviewSession instead (same function, renamed for clarity)
 */
export function useCandidateAuth(interviewId: string | undefined) {
  return useInterviewSession(interviewId);
}

/**
 * Hook for managing interview session token-based access.
 * Extracts token from URL query param and validates with the API.
 */
export function useInterviewSession(interviewId: string | undefined) {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CandidateAuthState>({
    interviewId: interviewId || null,
    token: null,
    interview: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  const initializeAuth = useCallback(async () => {
    if (!interviewId) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'No interview ID provided',
      }));
      return;
    }

    // Get token from URL or previously stored
    let token = searchParams.get('token') || getInterviewToken();

    if (!token) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'No access token provided. Please use the interview link sent to you.',
      }));
      return;
    }

    // Store the token for API calls
    setInterviewToken(token);

    try {
      // Validate token by fetching interview
      const interviewData = await interviews.candidate.getCurrent();

      // Verify the interview ID matches
      if (interviewData.id !== interviewId) {
        setInterviewToken(null);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Invalid access token for this interview.',
        }));
        return;
      }

      // Reconnect socket with the token
      reconnectWithToken(token);

      setState({
        interviewId,
        token,
        interview: interviewData,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (error: any) {
      console.error('Failed to validate interview token:', error);
      setInterviewToken(null);

      let errorMessage = 'Failed to access interview. Please try again.';
      if (error.status === 401) {
        errorMessage = 'Invalid or expired access token. Please request a new interview link.';
      } else if (error.status === 404) {
        errorMessage = 'Interview not found.';
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [interviewId, searchParams]);

  useEffect(() => {
    initializeAuth();

    // Cleanup token on unmount
    return () => {
      // Don't clear token - user might navigate back
    };
  }, [initializeAuth]);

  // Re-fetch interview data
  const refreshInterview = useCallback(async () => {
    if (!state.isAuthenticated) return;

    try {
      const interviewData = await interviews.candidate.getCurrent();
      setState(prev => ({
        ...prev,
        interview: interviewData,
      }));
    } catch (error) {
      console.error('Failed to refresh interview:', error);
    }
  }, [state.isAuthenticated]);

  return {
    ...state,
    refreshInterview,
    // Backwards compatibility
    user: state.isAuthenticated ? { id: 'candidate' } : null,
    isLinkedToInterview: state.isAuthenticated,
  };
}
