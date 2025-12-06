import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, Upload, Settings, AlertCircle, LayoutDashboard, ChevronRight, Loader2, Building2, Download, ChevronDown, Mail, Lock } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { PreviewPanel } from "@/components/preview-panel";
import { generatePDF } from "@/lib/pdf-generator";
import type { Product, Pricelist, CompanyBranding, SalesAgent, Template, QRCodeConfig } from "@shared/schema";
import wineBackground from "@assets/StoriedWineskin_1764863781074.png";

export default function Landing() {
  const [error, setError] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { viewMode, impersonatedCompanyId } = useViewMode();
  const queryClient = useQueryClient();
  
  // Brand selection state for downloads
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [isBrandSelectorOpen, setIsBrandSelectorOpen] = useState(false);
  
  // Email/password login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Handle error parameter from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "unauthorized") {
      setError("Access denied. Your email domain is not authorized. Please contact your administrator.");
    }
  }, []);

  // Reset brand selection when company context changes
  useEffect(() => {
    setSelectedBrands(new Set());
    setIsBrandSelectorOpen(false);
  }, [impersonatedCompanyId]);

  // Auto-redirect clients to /client page
  useEffect(() => {
    if (!authLoading && user?.role === 'client') {
      setLocation('/client');
    }
  }, [user, authLoading, setLocation]);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }
      
      // Invalidate user query to refresh auth state
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      
      // Redirect based on user role
      if (data.user?.role === 'client') {
        window.location.href = '/client';
      } else {
        // Reload to refresh the entire app state for admins
        window.location.reload();
      }
    } catch (err) {
      setLoginError('Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Determine if we can fetch data:
  // - For superAdmin: only if impersonatedCompanyId is set
  // - For other roles: always (they have a company assigned)
  const isSuperAdmin = user?.role === 'superAdmin';
  const canFetchCompanyData = !!user && (!isSuperAdmin || impersonatedCompanyId !== null);

  // Fetch latest pricelist for authenticated users (only when company is determined)
  // Use short staleTime to ensure fresh data on each visit
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
    staleTime: 0, // Always consider data stale to ensure fresh fetch
    refetchOnMount: true, // Refetch when component mounts
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

  // Get sales agents from pricelist
  const salesAgents: SalesAgent[] = useMemo(() => {
    if (latestPricelist?.salesAgents) {
      try {
        return typeof latestPricelist.salesAgents === 'string'
          ? JSON.parse(latestPricelist.salesAgents)
          : latestPricelist.salesAgents;
      } catch {
        return [];
      }
    }
    return [];
  }, [latestPricelist]);

  // Get QR code config from pricelist
  const qrCodeConfig: QRCodeConfig | undefined = useMemo(() => {
    if (latestPricelist?.qrCode) {
      try {
        return typeof latestPricelist.qrCode === 'string'
          ? JSON.parse(latestPricelist.qrCode)
          : latestPricelist.qrCode;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [latestPricelist]);

  // Get template from pricelist or company defaults
  const template = latestPricelist?.template || companyDefaults?.defaultTemplate || 'modern';

  // Get sorted list of brands for selection (category order, then displayOrder, then alphabetical)
  const sortedBrands = useMemo(() => {
    if (!brandOrderingData) return [];
    
    const categoryOrder: Record<string, number> = {
      'wine': 1,
      'spirits': 2,
      'cider': 3,
      'nonAlc': 4,
    };
    
    return [...brandOrderingData].sort((a, b) => {
      // First by category order
      const catOrderA = categoryOrder[a.category] || 999;
      const catOrderB = categoryOrder[b.category] || 999;
      if (catOrderA !== catOrderB) return catOrderA - catOrderB;
      
      // Then by displayOrder if set
      if (a.displayOrder !== null && b.displayOrder !== null) {
        return a.displayOrder - b.displayOrder;
      }
      if (a.displayOrder !== null) return -1;
      if (b.displayOrder !== null) return 1;
      
      // Finally alphabetically
      return a.brandName.localeCompare(b.brandName);
    });
  }, [brandOrderingData]);

  // Toggle brand selection
  const toggleBrand = (brandName: string) => {
    setSelectedBrands(prev => {
      const next = new Set(prev);
      if (next.has(brandName)) {
        next.delete(brandName);
      } else {
        next.add(brandName);
      }
      return next;
    });
  };

  // Select/deselect all brands
  const toggleAllBrands = (select: boolean) => {
    if (select) {
      setSelectedBrands(new Set(sortedBrands.map(b => b.brandName)));
    } else {
      setSelectedBrands(new Set());
    }
  };

  // Download PDF for all brands
  const handleDownloadAll = async () => {
    if (!products.length || !brandOrderingData) return;
    
    setIsDownloading(true);
    try {
      await generatePDF({
        products,
        branding,
        salesAgents,
        qrCodeConfig,
        template: template as Template,
        pricelistName: latestPricelist?.name || 'Pricelist',
        brandRegistry: brandOrderingData as any,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Download PDF for selected brands only
  const handleDownloadSelected = async () => {
    if (!products.length || !brandOrderingData || selectedBrands.size === 0) return;
    
    setIsDownloading(true);
    try {
      // Filter products to only include those from selected brands
      const filteredProducts = products.filter(product => {
        if (!product.sku) return false;
        const brandName = skuToBrandMap.get(product.sku);
        return brandName && selectedBrands.has(brandName);
      });
      
      // Filter brand registry to only include selected brands
      const filteredBrandRegistry = brandOrderingData.filter(brand => 
        selectedBrands.has(brand.brandName)
      );
      
      const brandNames = Array.from(selectedBrands).join(', ');
      const fileName = selectedBrands.size === 1 
        ? Array.from(selectedBrands)[0] 
        : `${selectedBrands.size}_brands`;
      
      await generatePDF({
        products: filteredProducts,
        branding,
        salesAgents,
        qrCodeConfig,
        template: template as Template,
        pricelistName: `${latestPricelist?.name || 'Pricelist'} - ${fileName}`,
        brandRegistry: filteredBrandRegistry as any,
      });
    } finally {
      setIsDownloading(false);
    }
  };

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
    <div 
      className="min-h-screen relative"
      style={{
        backgroundImage: `url(${wineBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-black/60" />
      
      {/* Content layer */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/30 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">Pricelist Generator</h1>
                <p className="text-sm text-white/70">Professional pricelists from CSV data</p>
              </div>
              {user ? (
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <Button 
                      variant="outline" 
                      onClick={() => setLocation('/dashboard')}
                      className="border-white/30 text-white hover:bg-white/10 hover:text-white"
                      data-testid="button-dashboard"
                    >
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Dashboard
                    </Button>
                  )}
                  <Button 
                    onClick={() => setLocation('/client')}
                    className="bg-white text-black hover:bg-white/90"
                    data-testid="button-client-area"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Pricelist Editor
                  </Button>
                  <UserProfileMenu />
                </div>
              ) : (
                <Button 
                  onClick={handleLogin} 
                  className="bg-white text-black hover:bg-white/90"
                  data-testid="button-login"
                >
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
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">Current Pricelist</h2>
              {latestPricelist && !isPricelistDataLoading && (
                <p className="text-white/70">
                  {latestPricelist.name} • {products.length} products
                </p>
              )}
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
              <div className="space-y-4">
                {/* Download Section */}
                <Card className="p-4">
                  <div className="flex flex-col gap-4">
                    {/* Download All Button */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="font-semibold">Download Pricelist</h3>
                        <p className="text-sm text-muted-foreground">
                          Download all brands or select specific brands below
                        </p>
                      </div>
                      <Button
                        onClick={handleDownloadAll}
                        disabled={isDownloading}
                        data-testid="button-download-all"
                      >
                        {isDownloading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        Download All Brands
                      </Button>
                    </div>

                    {/* Brand Selector */}
                    <Collapsible 
                      open={isBrandSelectorOpen} 
                      onOpenChange={setIsBrandSelectorOpen}
                    >
                      <CollapsibleTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full justify-between"
                          data-testid="button-toggle-brand-selector"
                        >
                          <span>Select Specific Brands ({selectedBrands.size} selected)</span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${isBrandSelectorOpen ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <div className="border rounded-lg p-4 space-y-4">
                          {/* Select All / Clear All */}
                          <div className="flex items-center justify-between gap-2 pb-3 border-b">
                            <span className="text-sm font-medium">
                              {sortedBrands.length} brands available
                            </span>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => toggleAllBrands(true)}
                                data-testid="button-select-all-brands"
                              >
                                Select All
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => toggleAllBrands(false)}
                                data-testid="button-clear-all-brands"
                              >
                                Clear All
                              </Button>
                            </div>
                          </div>

                          {/* Brand List by Category */}
                          <div className="grid gap-4 max-h-[300px] overflow-y-auto">
                            {['wine', 'spirits', 'cider', 'nonAlc'].map(category => {
                              const categoryBrands = sortedBrands.filter(b => b.category === category);
                              if (categoryBrands.length === 0) return null;
                              
                              const categoryLabel = {
                                'wine': 'Wine',
                                'spirits': 'Spirits',
                                'cider': 'Cider',
                                'nonAlc': 'Non-Alcoholic',
                              }[category];
                              
                              return (
                                <div key={category} className="space-y-2">
                                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                    {categoryLabel}
                                  </h4>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {categoryBrands.map(brand => (
                                      <div 
                                        key={brand.brandName}
                                        className="flex items-center space-x-2"
                                      >
                                        <Checkbox
                                          id={`brand-${brand.brandName}`}
                                          checked={selectedBrands.has(brand.brandName)}
                                          onCheckedChange={() => toggleBrand(brand.brandName)}
                                          data-testid={`checkbox-brand-${brand.brandName.replace(/\s+/g, '-').toLowerCase()}`}
                                        />
                                        <Label 
                                          htmlFor={`brand-${brand.brandName}`}
                                          className="text-sm cursor-pointer"
                                        >
                                          {brand.brandName}
                                        </Label>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Download Selected Button */}
                          {selectedBrands.size > 0 && (
                            <div className="pt-3 border-t">
                              <Button
                                onClick={handleDownloadSelected}
                                disabled={isDownloading}
                                className="w-full"
                                data-testid="button-download-selected"
                              >
                                {isDownloading ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4 mr-2" />
                                )}
                                Download {selectedBrands.size} Selected Brand{selectedBrands.size !== 1 ? 's' : ''}
                              </Button>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </Card>

                {/* Pricelist Preview */}
                <Card className="overflow-hidden">
                  <div className="max-h-[600px] overflow-y-auto">
                    <PreviewPanel
                      products={products}
                      branding={branding}
                      salesAgents={salesAgents}
                      qrCodeConfig={qrCodeConfig}
                      template={template as Template}
                      brandRegistry={brandOrderingData as any}
                      companyId={pricelistCompanyId}
                    />
                  </div>
                </Card>
              </div>
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
            <h2 className="text-4xl font-bold tracking-tight text-white">
              Create Professional Pricelists
              <br />
              <span className="text-amber-400">In Minutes</span>
            </h2>
            <p className="text-xl text-white/80 max-w-2xl mx-auto">
              Transform your CSV data into beautiful, print-ready pricelists with customizable templates,
              company branding, and sales agent information.
            </p>
            <Button
              size="lg"
              onClick={handleLogin}
              className="text-lg px-8 bg-white text-black hover:bg-white/90"
              data-testid="button-hero-login"
            >
              Get Started
            </Button>
          </div>
        )}

        {/* Features Grid */}
        <div className={`grid md:grid-cols-3 gap-8 ${user ? 'mb-8' : 'mb-16'}`}>
          <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <Upload className="w-12 h-12 mb-4 text-amber-400" />
              <CardTitle className="text-white">Upload CSV</CardTitle>
              <CardDescription className="text-white/70">
                Import your product data from CSV files. Auto-detect field mappings for quick setup.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <Settings className="w-12 h-12 mb-4 text-amber-400" />
              <CardTitle className="text-white">Professional Output</CardTitle>
              <CardDescription className="text-white/70">
                Your company branding and formatting are automatically applied to every pricelist.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <FileText className="w-12 h-12 mb-4 text-amber-400" />
              <CardTitle className="text-white">Export PDF</CardTitle>
              <CardDescription className="text-white/70">
                Generate professional, print-ready PDFs instantly with your latest product data.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* CTA Section - Login only for unauthenticated users */}
        {!user && (
          <div className="bg-black/50 border border-white/10 rounded-lg p-12 backdrop-blur-sm">
            <div className="max-w-md mx-auto">
              <h3 className="text-2xl font-semibold mb-4 text-center text-white">Ready to create your first pricelist?</h3>
              
              {/* Email/Password Login Form */}
              <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
                {loginError && (
                  <Alert variant="destructive" data-testid="alert-login-form-error">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-white">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 bg-black/30 border-white/20 text-white placeholder:text-white/50"
                      required
                      data-testid="input-login-email"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-white">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 bg-black/30 border-white/20 text-white placeholder:text-white/50"
                      required
                      data-testid="input-login-password"
                    />
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full bg-white text-black hover:bg-white/90" 
                  disabled={isLoggingIn}
                  data-testid="button-email-login"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
              
              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/20" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-black/50 px-2 text-white/60">Or continue with</span>
                </div>
              </div>
              
              {/* Google Login Button */}
              <Button 
                variant="outline" 
                size="lg" 
                onClick={handleLogin} 
                className="w-full border-white/30 text-white hover:bg-white/10 hover:text-white"
                data-testid="button-cta-login"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>
            </div>
          </div>
        )}
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 mt-8">
          <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-white/60">
            <p>
              © 2025{" "}
              <a 
                href="https://citywidedigital.ca/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-white transition-colors underline"
                data-testid="link-citywide-digital"
              >
                CityWide Digital
              </a>
              {" "}Pricelist Generator
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
