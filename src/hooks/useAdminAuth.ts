/**
 * @deprecated Use useAuth() from '@/hooks/useAuth' instead.
 * This hook is kept for backwards compatibility.
 */

import { useAuth } from './useAuth';

interface UseAdminAuthReturn {
  user: { id: string; email: string } | null;
  isAdmin: boolean;
  isLoading: boolean;
}

export const useAdminAuth = (): UseAdminAuthReturn => {
  const { user, isAdmin, isLoading } = useAuth();

  return {
    user: user ? { id: user.id, email: user.email } : null,
    isAdmin,
    isLoading,
  };
};
