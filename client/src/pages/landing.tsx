import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileText, Upload, Settings, AlertCircle, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import type { Pricelist, CompanyBranding, Product, SalesAgent, QRCodeConfig, Template } from "@shared/schema";
import { generatePDF } from "@/lib/pdf-generator";

export default function Landing() {
  const [error, setError] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Only fetch latest pricelist if user is logged in as client
  const { data: latestPricelist, isLoading: pricelistLoading } = useQuery<Pricelist>({
    queryKey: ['/api/pricelists/latest'],
    enabled: !!user && user.role === 'client',
  });

  // Fetch company defaults for creating new pricelists
  const { data: companyDefaults } = useQuery<{
    defaultTemplate: string;
    defaultBranding: CompanyBranding;
    defaultFieldMapping: Record<string, string>;
  }>({
    queryKey: ['/api/companies/defaults'],
    enabled: !!user && user.role === 'client',
  });

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

  // Update mutation for existing pricelists
  const updateMutation = useMutation({
    mutationFn: async (data: { products: Product[] }) => {
      const res = await apiRequest("PATCH", `/api/pricelists/${latestPricelist?.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricelists/latest'] });
      toast({
        title: "Pricelist updated",
        description: "Your pricelist has been updated successfully",
      });
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  // Create mutation for new pricelists
  const createMutation = useMutation({
    mutationFn: async (data: {
      products: Product[];
      branding: CompanyBranding;
      template: string;
      fieldMapping: Record<string, string>;
    }) => {
      // Auto-generate name based on company and date
      const today = new Date();
      const formattedDate = today.toLocaleDateString('en-US', { 
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      const name = `${data.branding.companyName} Price List - ${formattedDate}`;

      const res = await apiRequest("POST", "/api/pricelists", {
        name,
        products: data.products,
        branding: data.branding,
        salesAgents: [],
        template: data.template,
        fieldMapping: data.fieldMapping,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricelists/latest'] });
      toast({
        title: "Pricelist created",
        description: "Your pricelist has been created successfully",
      });
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Creation failed",
        description: error.message,
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Validate CSV has data
        if (!results.data || results.data.length === 0) {
          toast({
            title: "Invalid CSV file",
            description: "The CSV file appears to be empty",
            variant: "destructive",
          });
          setIsUploading(false);
          return;
        }

        // Use field mapping to extract products
        const fieldMapping = companyDefaults?.defaultFieldMapping || {};
        const products = results.data.map((row: any, index: number) => ({
          id: `product-${Date.now()}-${index}`,
          category: row[fieldMapping.category] || row['Category'] || "",
          product: row[fieldMapping.product] || row['Name'] || row['Product'] || "Unnamed Product",
          sku: row[fieldMapping.sku] || row['SKU'] || row['Code'] || "N/A",
          format: row[fieldMapping.format] || row['Format'] || row['Unit'] || "N/A",
          price: row[fieldMapping.price] || row['Price'] || row['Cost'] || "$0.00",
        }));

        // Validate we got some products
        if (products.length === 0) {
          toast({
            title: "No products found",
            description: "Could not extract any products from the CSV file",
            variant: "destructive",
          });
          setIsUploading(false);
          return;
        }

        // Update or create pricelist
        if (latestPricelist) {
          updateMutation.mutate({ products });
        } else {
          // Ensure we have complete company defaults before creating
          if (!companyDefaults?.defaultTemplate || 
              !companyDefaults?.defaultBranding ||
              !companyDefaults.defaultBranding.companyName ||
              companyDefaults.defaultBranding.companyName.trim() === "") {
            toast({
              title: "Configuration incomplete",
              description: "Please contact your administrator to set up company name and template",
              variant: "destructive",
            });
            setIsUploading(false);
            return;
          }
          
          // Build branding with validated company name
          const branding: CompanyBranding = {
            companyName: companyDefaults.defaultBranding.companyName.trim(),
            tagline: companyDefaults.defaultBranding.tagline || "",
          };
          
          const template = companyDefaults.defaultTemplate;
          createMutation.mutate({ products, branding, template, fieldMapping });
        }
      },
      error: (error) => {
        toast({
          title: "CSV parse error",
          description: error.message,
          variant: "destructive",
        });
        setIsUploading(false);
      },
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
    disabled: isUploading,
  });

  const handleDownload = async () => {
    if (!latestPricelist) return;

    setIsDownloading(true);
    try {
      await generatePDF({
        products: latestPricelist.products as Product[],
        branding: latestPricelist.branding as CompanyBranding,
        salesAgents: latestPricelist.salesAgents as SalesAgent[],
        qrCodeConfig: latestPricelist.qrCode as QRCodeConfig | undefined,
        template: latestPricelist.template as Template,
        pricelistName: latestPricelist.name,
      });
      
      toast({
        title: "PDF downloaded",
        description: "Your pricelist has been downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Show loading state while checking auth
  if (authLoading || (user?.role === 'client' && pricelistLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect admins to dashboard
  if (user?.role === 'admin') {
    window.location.href = '/dashboard';
    return null;
  }

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
            {!user && (
              <Button onClick={handleLogin} data-testid="button-login">
                Log In with Google
              </Button>
            )}
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

        {/* CTA Section - Conditional based on auth state */}
        <div className="text-center bg-card border rounded-lg p-12">
          {!user ? (
            // Not logged in - show login CTA
            <>
              <h3 className="text-2xl font-semibold mb-4">Ready to create your first pricelist?</h3>
              <p className="text-muted-foreground mb-6">
                Log in with your Google account to get started.
              </p>
              <Button size="lg" onClick={handleLogin} data-testid="button-cta-login">
                Log In with Google
              </Button>
            </>
          ) : (
            // Logged in as client - show pricelist actions
            <div className="space-y-4">
              {latestPricelist ? (
                <>
                  <Button
                    size="lg"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full max-w-md"
                    data-testid="button-download-pricelist"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    {isDownloading ? "Downloading..." : latestPricelist.name}
                  </Button>
                  <div
                    {...getRootProps()}
                    className={`
                      w-full max-w-md mx-auto p-8 border-2 border-dashed rounded-lg cursor-pointer
                      transition-colors
                      ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
                      ${isUploading ? "opacity-50 cursor-not-allowed" : ""}
                    `}
                    data-testid="area-csv-upload"
                  >
                    <input {...getInputProps()} />
                    <div className="text-center">
                      <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">
                        {isUploading ? "Uploading..." : "Upload New CSV, Replaces Current Price List"}
                      </p>
                      {!isUploading && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Drop CSV file here or click to browse
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                // No pricelist yet - show upload only
                <div
                  {...getRootProps()}
                  className={`
                    w-full max-w-md mx-auto p-8 border-2 border-dashed rounded-lg cursor-pointer
                    transition-colors
                    ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
                    ${isUploading ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                  data-testid="area-csv-upload"
                >
                  <input {...getInputProps()} />
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-semibold mb-2">
                      {isUploading ? "Uploading..." : "Upload Your First Price List"}
                    </p>
                    {!isUploading && (
                      <p className="text-sm text-muted-foreground">
                        Drop CSV file here or click to browse
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
