import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

interface CandidateAuthState {
  user: User | null;
  isLoading: boolean;
  isLinkedToInterview: boolean;
  error: string | null;
}

/**
 * Hook for managing anonymous candidate authentication for interviews.
 * Handles anonymous sign-in and linking the anonymous user to an interview.
 */
export function useCandidateAuth(interviewId: string | undefined) {
  const [state, setState] = useState<CandidateAuthState>({
    user: null,
    isLoading: true,
    isLinkedToInterview: false,
    error: null,
  });

  // Initialize anonymous auth and link to interview
  const initializeAuth = useCallback(async () => {
    if (!interviewId) {
      setState(prev => ({ ...prev, isLoading: false, error: 'No interview ID provided' }));
      return;
    }

    try {
      // Check for existing session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      let currentUser = session?.user;

      // If no session or not anonymous, sign in anonymously
      if (!currentUser) {
        console.log('No session found, signing in anonymously...');
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        
        if (anonError) {
          console.error('Anonymous sign-in error:', anonError);
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: 'Failed to initialize authentication. Please refresh the page.' 
          }));
          return;
        }

        currentUser = anonData.user;
        console.log('Signed in anonymously:', currentUser?.id);
      } else {
        console.log('Existing session found:', currentUser.id, 'is_anonymous:', currentUser.is_anonymous);
      }

      if (!currentUser) {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Authentication failed. Please refresh the page.' 
        }));
        return;
      }

      // Check if already linked to this interview
      const { data: existingLink, error: linkCheckError } = await supabase
        .from('candidate_interviews')
        .select('id')
        .eq('interview_id', interviewId)
        .eq('anon_user_id', currentUser.id)
        .maybeSingle();

      if (linkCheckError) {
        console.error('Error checking interview link:', linkCheckError);
      }

      if (existingLink) {
        console.log('Already linked to interview:', interviewId);
        setState({
          user: currentUser,
          isLoading: false,
          isLinkedToInterview: true,
          error: null,
        });
        return;
      }

      // Check if interview exists first (use RPC or check via different method)
      // For now, try to insert the link - if interview doesn't exist, it will fail
      console.log('Linking anonymous user to interview:', interviewId);
      const { error: insertError } = await supabase
        .from('candidate_interviews')
        .insert({
          interview_id: interviewId,
          anon_user_id: currentUser.id,
        });

      if (insertError) {
        // Check if it's a unique constraint violation (already linked)
        if (insertError.code === '23505') {
          console.log('Already linked (race condition)');
          setState({
            user: currentUser,
            isLoading: false,
            isLinkedToInterview: true,
            error: null,
          });
          return;
        }
        
        // Check if it's a foreign key violation (interview doesn't exist)
        if (insertError.code === '23503') {
          setState({
            user: currentUser,
            isLoading: false,
            isLinkedToInterview: false,
            error: 'Interview not found or has expired.',
          });
          return;
        }

        console.error('Error linking to interview:', insertError);
        setState({
          user: currentUser,
          isLoading: false,
          isLinkedToInterview: false,
          error: 'Failed to access interview. Please try again.',
        });
        return;
      }

      console.log('Successfully linked to interview');
      setState({
        user: currentUser,
        isLoading: false,
        isLinkedToInterview: true,
        error: null,
      });

    } catch (error) {
      console.error('Unexpected error in initializeAuth:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'An unexpected error occurred. Please refresh the page.',
      }));
    }
  }, [interviewId]);

  useEffect(() => {
    initializeAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      if (event === 'SIGNED_OUT') {
        setState(prev => ({
          ...prev,
          user: null,
          isLinkedToInterview: false,
        }));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initializeAuth]);

  return state;
}
