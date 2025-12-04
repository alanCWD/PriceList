import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import ClientLanding from "@/pages/client-landing";
import Editor from "@/pages/editor";
import PricelistView from "@/pages/pricelist-view";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Protected route component that redirects clients to /client
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, isClient, isAdmin } = useAuth();
  
  if (isLoading) {
    return null; // Show nothing while loading auth state
  }
  
  // Redirect unauthenticated users to landing page
  if (!user) {
    return <Redirect to="/" />;
  }
  
  // Redirect clients to /client page - they cannot access admin routes
  if (isClient) {
    return <Redirect to="/client" />;
  }
  
  // Only allow admins and super admins
  if (!isAdmin) {
    return <Redirect to="/client" />;
  }
  
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard">{() => <AdminRoute component={Dashboard} />}</Route>
      <Route path="/client" component={ClientLanding} />
      <Route path="/editor">{() => <AdminRoute component={Editor} />}</Route>
      <Route path="/view">{() => <AdminRoute component={PricelistView} />}</Route>
      <Route path="/admin">{() => <AdminRoute component={AdminPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ViewModeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ViewModeProvider>
    </QueryClientProvider>
  );
}

export default App;
