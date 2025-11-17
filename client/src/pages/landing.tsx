import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Upload, Settings } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
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
          <Button
            size="lg"
            onClick={handleLogin}
            className="text-lg px-8"
            data-testid="button-hero-login"
          >
            Get Started
          </Button>
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

        {/* CTA Section */}
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
          <p>© 2024 Pricelist Generator. Professional pricelists made simple.</p>
        </div>
      </footer>
    </div>
  );
}
