import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileText, Upload, Settings, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useViewMode } from "@/contexts/ViewModeContext";

export default function Landing() {
  const [error, setError] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { viewMode } = useViewMode();

  // Handle error parameter from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "unauthorized") {
      setError("Access denied. Your email domain is not authorized. Please contact your administrator.");
    }
  }, []);

  // Handle role-based routing (redirect authenticated users to appropriate pages)
  useEffect(() => {
    if (!user) return;

    // Redirect based on role and viewMode
    if (user.role === 'client') {
      setLocation('/client');
    } else if (user.role === 'companyAdmin') {
      if (viewMode === 'admin') {
        setLocation('/dashboard');
      } else {
        setLocation('/client');
      }
    } else if (user.role === 'superAdmin') {
      if (viewMode === 'admin') {
        setLocation('/dashboard');
      } else {
        setLocation('/client');
      }
    }
  }, [user, viewMode, setLocation]);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Don't render if user is being redirected
  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Pricelist Generator</h1>
              <p className="text-sm text-muted-foreground">Professional pricelists from CSV data</p>
            </div>
            <Button onClick={handleLogin} data-testid="button-login">
              Log In with Google
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-8" data-testid="alert-login-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Login Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="text-center space-y-6 mb-16">
          <h2 className="text-4xl font-bold tracking-tight">
            Create Professional Pricelists
            <br />
            <span className="text-primary">In Minutes</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transform your CSV data into beautiful, print-ready pricelists with customizable templates,
            company branding, and sales agent information.
          </p>
          {!user && (
            <Button
              size="lg"
              onClick={handleLogin}
              className="text-lg px-8"
              data-testid="button-hero-login"
            >
              Get Started
            </Button>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card>
            <CardHeader>
              <Upload className="w-12 h-12 mb-4 text-primary" />
              <CardTitle>Upload CSV</CardTitle>
              <CardDescription>
                Import your product data from CSV files. Auto-detect field mappings for quick setup.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Settings className="w-12 h-12 mb-4 text-primary" />
              <CardTitle>Configure</CardTitle>
              <CardDescription>
                Customize company branding, add sales agent contacts, and include QR codes.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <FileText className="w-12 h-12 mb-4 text-primary" />
              <CardTitle>Export PDF</CardTitle>
              <CardDescription>
                Generate professional, print-ready PDFs with your choice of Modern, Classic, or Minimal templates.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* CTA Section - Login only (authenticated users are redirected) */}
        <div className="text-center bg-card border rounded-lg p-12">
          <h3 className="text-2xl font-semibold mb-4">Ready to create your first pricelist?</h3>
          <p className="text-muted-foreground mb-6">
            Log in with your Google account to get started.
          </p>
          <Button size="lg" onClick={handleLogin} data-testid="button-cta-login">
            Log In with Google
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          <p>
            © 2025{" "}
            <a 
              href="https://citywidedigital.ca/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors underline"
              data-testid="link-citywide-digital"
            >
              CityWide Digital
            </a>
            {" "}Pricelist Generator
          </p>
        </div>
      </footer>
    </div>
  );
}
