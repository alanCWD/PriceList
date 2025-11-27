// Auth hook for Replit Auth
// Based on blueprint: javascript_log_in_with_replit
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn<User | null>({ on401: "returnNull" }),
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
