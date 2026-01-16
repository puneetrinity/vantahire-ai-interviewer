/**
 * Auth Context and Hook
 * Provides authentication state and user info across the app
 * Replaces Supabase auth with API cookie-based sessions
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, users, type User, type RecruiterProfile, type CandidateProfile } from '@/lib/api';

interface AuthContextValue {
  user: User | null;
  recruiterProfile: RecruiterProfile | null;
  candidateProfile: CandidateProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isRecruiter: boolean;
  isCandidate: boolean;
  login: (provider: 'google' | 'linkedin') => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshRecruiterProfile: () => Promise<void>;
  refreshCandidateProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [recruiterProfile, setRecruiterProfile] = useState<RecruiterProfile | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await auth.getUser();
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setUser(null);
      return null;
    }
  }, []);

  const refreshRecruiterProfile = useCallback(async () => {
    try {
      const profile = await users.getRecruiterProfile();
      setRecruiterProfile(profile);
    } catch (error) {
      console.error('Failed to refresh recruiter profile:', error);
    }
  }, []);

  const refreshCandidateProfile = useCallback(async () => {
    try {
      const profile = await users.getCandidateProfile();
      setCandidateProfile(profile);
    } catch (error) {
      console.error('Failed to refresh candidate profile:', error);
    }
  }, []);

  // Initial auth check
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const userData = await auth.getUser();
        setUser(userData);

        // Fetch appropriate profile based on role
        if (userData?.role === 'RECRUITER' || userData?.role === 'ADMIN') {
          const profile = await users.getRecruiterProfile();
          setRecruiterProfile(profile);
        } else if (userData?.role === 'CANDIDATE') {
          const profile = await users.getCandidateProfile();
          setCandidateProfile(profile);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback((provider: 'google' | 'linkedin') => {
    if (provider === 'google') {
      auth.loginWithGoogle();
    } else {
      auth.loginWithLinkedIn();
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
      setUser(null);
      setRecruiterProfile(null);
      setCandidateProfile(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    recruiterProfile,
    candidateProfile,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN',
    isRecruiter: user?.role === 'RECRUITER',
    isCandidate: user?.role === 'CANDIDATE',
    login,
    logout,
    refreshUser,
    refreshRecruiterProfile,
    refreshCandidateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook for protected routes - redirects to auth if not logged in
 */
export function useRequireAuth(options?: {
  requiredRole?: 'ADMIN' | 'RECRUITER' | 'CANDIDATE';
  redirectTo?: string;
}) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      navigate(options?.redirectTo || '/auth');
      return;
    }

    if (options?.requiredRole && user?.role !== options.requiredRole) {
      // Redirect based on actual role
      if (user?.role === 'ADMIN') {
        navigate('/admin');
      } else if (user?.role === 'CANDIDATE') {
        navigate('/candidate/dashboard');
      } else {
        navigate('/dashboard');
      }
    }
  }, [isLoading, isAuthenticated, user, navigate, options]);

  return { user, isLoading };
}
