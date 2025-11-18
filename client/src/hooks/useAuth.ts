// Auth hook for Replit Auth
// Based on blueprint: javascript_log_in_with_replit
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isSuperAdmin: user?.role === "superAdmin",
    isAdmin: user?.role === "admin" || user?.role === "superAdmin", // Both admin and superAdmin
    isCompanyAdmin: user?.role === "admin", // Company-scoped admin only
    isClient: user?.role === "client",
  };
}
