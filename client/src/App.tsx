import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import ClientLanding from "@/pages/client-landing";
import Editor from "@/pages/editor";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  // Fetch user data to check role
  const { data: user, isLoading: isLoadingUser, error: userError } = useQuery<User>({
    queryKey: ['/api/auth/user'],
    enabled: isAuthenticated,
    retry: false, // Don't retry on error
  });

  // Show landing page for unauthenticated users
  if (isLoading || !isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  // Show error state if user fetch failed
  if (userError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Unable to load user data</h1>
          <p className="text-muted-foreground mb-6">
            There was a problem loading your account information. Please try logging in again.
          </p>
          <button
            onClick={() => window.location.href = '/api/auth/logout'}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover-elevate"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while fetching user role
  if (isLoadingUser || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Determine home page based on role
  const HomePage = user.role === "admin" ? Dashboard : ClientLanding;

  // Show authenticated routes
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/client" component={ClientLanding} />
      <Route path="/editor" component={Editor} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
