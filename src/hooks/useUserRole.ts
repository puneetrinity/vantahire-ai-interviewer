/**
 * @deprecated Use useAuth() from '@/hooks/useAuth' instead.
 * This hook is kept for backwards compatibility.
 */

import { useAuth } from './useAuth';

export type UserRole = 'RECRUITER' | 'CANDIDATE' | 'ADMIN' | null;

interface UseUserRoleReturn {
  user: { id: string; email: string } | null;
  role: UserRole;
  isLoading: boolean;
  error: string | null;
}

export const useUserRole = (): UseUserRoleReturn => {
  const { user, isLoading } = useAuth();

  return {
    user: user ? { id: user.id, email: user.email } : null,
    role: user?.role || null,
    isLoading,
    error: null,
  };
};
