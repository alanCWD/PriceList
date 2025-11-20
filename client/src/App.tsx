import { Switch, Route } from "wouter";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/client" component={ClientLanding} />
      <Route path="/editor" component={Editor} />
      <Route path="/view" component={PricelistView} />
      <Route path="/admin" component={AdminPage} />
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
