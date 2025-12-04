import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileText, Upload, Settings, AlertCircle, LayoutDashboard, ChevronRight, Loader2, Building2 } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useQuery } from "@tanstack/react-query";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { PreviewPanel } from "@/components/preview-panel";
import type { Product, Pricelist, CompanyBranding, SalesAgent, Template, QRCodeConfig } from "@shared/schema";

export default function Landing() {
  const [error, setError] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { viewMode, impersonatedCompanyId } = useViewMode();

  // Handle error parameter from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "unauthorized") {
      setError("Access denied. Your email domain is not authorized. Please contact your administrator.");
    }
  }, []);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  // Determine if we can fetch data:
  // - For superAdmin: only if impersonatedCompanyId is set
  // - For other roles: always (they have a company assigned)
  const isSuperAdmin = user?.role === 'superAdmin';
  const canFetchCompanyData = !!user && (!isSuperAdmin || impersonatedCompanyId !== null);

  // Fetch latest pricelist for authenticated users (only when company is determined)
  const { data: latestPricelist, isLoading: pricelistLoading } = useQuery<Pricelist>({
    queryKey: ['/api/pricelists/latest', { impersonatedCompanyId }],
    queryFn: async () => {
      const url = impersonatedCompanyId 
        ? `/api/pricelists/latest?companyId=${impersonatedCompanyId}`
        : '/api/pricelists/latest';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch pricelist');
      return response.json();
    },
    enabled: canFetchCompanyData,
  });

  // Fetch company defaults for branding
  const { data: companyDefaults } = useQuery<{
    defaultTemplate: Template;
    defaultBranding: CompanyBranding | null;
  }>({
    queryKey: ['/api/companies/defaults', { impersonatedCompanyId }],
    queryFn: async () => {
      const url = impersonatedCompanyId 
        ? `/api/companies/defaults?companyId=${impersonatedCompanyId}`
        : '/api/companies/defaults';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch company defaults');
      return response.json();
    },
    enabled: canFetchCompanyData,
  });

  // Fetch brand ordering data for pricelist preview
  const pricelistCompanyId = latestPricelist?.companyId || impersonatedCompanyId;
  
  const { data: brandOrderingData, isLoading: brandOrderingLoading } = useQuery<{ 
    brandName: string; 
    category: 'cider' | 'wine' | 'spirits' | 'nonAlc';
    displayOrder: number | null;
    productOrder: string[] | null;
    skus: string[];
  }[]>({
    queryKey: ['/api/brands/ordering', { companyId: pricelistCompanyId }],
    queryFn: async () => {
      const url = pricelistCompanyId 
        ? `/api/brands/ordering?companyId=${pricelistCompanyId}`
        : '/api/brands/ordering';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch brand ordering');
      return response.json();
    },
    enabled: canFetchCompanyData && pricelistCompanyId !== null,
  });

  // Fetch hidden SKUs
  const { data: hiddenSkus, isLoading: hiddenSkusLoading } = useQuery<string[]>({
    queryKey: ['/api/visibility/hidden-skus', { companyId: pricelistCompanyId }],
    queryFn: async () => {
      const url = pricelistCompanyId 
        ? `/api/visibility/hidden-skus?companyId=${pricelistCompanyId}`
        : '/api/visibility/hidden-skus';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch hidden SKUs');
      return response.json();
    },
    enabled: canFetchCompanyData && pricelistCompanyId !== null,
  });

  // Check if all data needed for filtering is loaded
  const isDataReady = !pricelistLoading && !brandOrderingLoading && !hiddenSkusLoading && brandOrderingData !== undefined;

  // Build SKU→Brand map from brand ordering data
  const skuToBrandMap = useMemo(() => {
    const map = new Map<string, string>();
    if (brandOrderingData) {
      brandOrderingData.forEach(brand => {
        if (brand.skus) {
          brand.skus.forEach(sku => {
            map.set(sku, brand.brandName);
          });
        }
      });
    }
    return map;
  }, [brandOrderingData]);

  // Create a Set of hidden SKUs for efficient lookup
  const hiddenSkuSet = useMemo(() => new Set(hiddenSkus || []), [hiddenSkus]);

  // Parse products from pricelist and filter by brand registry + visibility
  // Always enforce strict SKU filtering - products must have SKU in brand registry
  const products: Product[] = useMemo(() => {
    // Return empty if pricelist not loaded or data not ready (shows loading state)
    if (!latestPricelist?.products || !isDataReady) return [];
    
    try {
      const parsed = typeof latestPricelist.products === 'string' 
        ? JSON.parse(latestPricelist.products) 
        : latestPricelist.products;
      
      // Always enforce SKU filter - products must have SKU registered in brand registry
      return (parsed as Product[]).filter(product => {
        if (!product.sku) return false;
        if (!skuToBrandMap.has(product.sku)) return false;
        if (hiddenSkuSet.has(product.sku)) return false;
        return true;
      });
    } catch {
      return [];
    }
  }, [latestPricelist, skuToBrandMap, hiddenSkuSet, isDataReady]);

  // Get branding from pricelist or company defaults
  const branding: CompanyBranding = useMemo(() => {
    if (latestPricelist?.branding) {
      try {
        return typeof latestPricelist.branding === 'string'
          ? JSON.parse(latestPricelist.branding)
          : latestPricelist.branding;
      } catch {
        return companyDefaults?.defaultBranding || { companyName: 'Company' };
      }
    }
    return companyDefaults?.defaultBranding || { companyName: 'Company' };
  }, [latestPricelist, companyDefaults]);

  // Get template from pricelist or company defaults
  const template = latestPricelist?.template || companyDefaults?.defaultTemplate || 'modern';

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Determine navigation options based on role
  const isAdmin = user?.role === 'superAdmin' || user?.role === 'companyAdmin';

  // Check if pricelist data is still loading
  const isPricelistDataLoading = pricelistLoading || brandOrderingLoading || hiddenSkusLoading;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Pricelist Generator</h1>
              <p className="text-sm text-muted-foreground">Professional pricelists from CSV data</p>
            </div>
            {user ? (
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <Button 
                    variant="outline" 
                    onClick={() => setLocation('/dashboard')}
                    data-testid="button-dashboard"
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                )}
                <Button 
                  onClick={() => setLocation('/client')}
                  data-testid="button-client-area"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Pricelist Editor
                </Button>
                <UserProfileMenu />
              </div>
            ) : (
              <Button onClick={handleLogin} data-testid="button-login">
                Log In with Google
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-8" data-testid="alert-login-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Login Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Pricelist Section - Only for authenticated users */}
        {user && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Current Pricelist</h2>
                {latestPricelist && !isPricelistDataLoading && (
                  <p className="text-muted-foreground">
                    {latestPricelist.name} • {products.length} products
                  </p>
                )}
              </div>
              <Button 
                variant="outline" 
                onClick={() => setLocation('/client')}
                data-testid="button-view-full-pricelist"
              >
                View Full Pricelist
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            {/* Super Admin without company selected */}
            {isSuperAdmin && !impersonatedCompanyId ? (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <Building2 className="w-12 h-12 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold mb-1">Select a Company</h3>
                    <p className="text-muted-foreground text-sm">
                      As a Super Admin, please select a company from your profile menu to view their pricelist.
                    </p>
                  </div>
                </div>
              </Card>
            ) : isPricelistDataLoading ? (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">Loading pricelist...</p>
                </div>
              </Card>
            ) : latestPricelist && products.length > 0 ? (
              <Card className="overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto">
                  <PreviewPanel
                    products={products}
                    branding={branding}
                    salesAgents={[]}
                    qrCodeConfig={undefined}
                    template={template as Template}
                    brandRegistry={brandOrderingData as any}
                    companyId={pricelistCompanyId}
                  />
                </div>
              </Card>
            ) : latestPricelist && products.length === 0 ? (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold mb-1">No Products to Display</h3>
                    <p className="text-muted-foreground text-sm">
                      Products require SKUs registered in the Brand Registry to appear.<br />
                      Contact your administrator to configure the Brand Registry.
                    </p>
                  </div>
                  <Button onClick={() => setLocation('/client')} data-testid="button-view-pricelist-editor">
                    <FileText className="w-4 h-4 mr-2" />
                    Open Pricelist Editor
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold mb-1">No Pricelist Available</h3>
                    <p className="text-muted-foreground text-sm">
                      Upload a CSV to create your first pricelist.
                    </p>
                  </div>
                  <Button onClick={() => setLocation('/client')} data-testid="button-create-pricelist">
                    <Upload className="w-4 h-4 mr-2" />
                    Create Pricelist
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Hero Section - Only for unauthenticated users */}
        {!user && (
          <div className="text-center space-y-6 mb-16 pt-8">
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
        )}

        {/* Features Grid */}
        <div className={`grid md:grid-cols-3 gap-8 ${user ? 'mb-8' : 'mb-16'}`}>
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

        {/* CTA Section - Login only for unauthenticated users */}
        {!user && (
          <div className="text-center bg-card border rounded-lg p-12">
            <h3 className="text-2xl font-semibold mb-4">Ready to create your first pricelist?</h3>
            <p className="text-muted-foreground mb-6">
              Log in with your Google account to get started.
            </p>
            <Button size="lg" onClick={handleLogin} data-testid="button-cta-login">
              Log In with Google
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-8">
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
