import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, Download, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { generatePDF } from "@/lib/pdf-generator";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, FieldMapping, Pricelist, Template } from "@shared/schema";
import Papa from "papaparse";

export default function ClientLanding() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Fetch latest pricelist
  const { data: latestPricelist, isLoading, error } = useQuery<Pricelist>({
    queryKey: ['/api/pricelists/latest'],
  });

  // Fetch company defaults for field mapping
  const { data: companyDefaults } = useQuery<{
    defaultTemplate: Template;
    defaultFieldMapping: FieldMapping | null;
    defaultBranding: CompanyBranding | null;
  }>({
    queryKey: ['/api/companies/defaults'],
  });

  // Update pricelist mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { products: Product[] }) => {
      if (!latestPricelist) return;
      
      // Only send mutable fields (let server handle updatedAt)
      const payload = {
        products: data.products,
      };
      
      const res = await apiRequest("PATCH", `/api/pricelists/${latestPricelist.id}`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricelists/latest'] });
      toast({
        title: "Price list updated",
        description: "Your price list has been updated successfully",
      });
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update price list",
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  // Create pricelist mutation (for first-time upload)
  const createMutation = useMutation({
    mutationFn: async (data: { products: Product[]; branding: CompanyBranding; template: Template; fieldMapping: FieldMapping }) => {
      const today = new Date();
      const formattedDate = today.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      
      // Use company name or fallback
      const companyName = data.branding.companyName || "Your Company";
      
      const payload = {
        name: `${companyName} Price List - ${formattedDate}`,
        description: `Created on ${formattedDate}`,
        products: data.products,
        branding: data.branding,
        salesAgents: [] as SalesAgent[],
        template: data.template,
        fieldMapping: data.fieldMapping,
        categoryFilter: null,
      };
      
      const res = await apiRequest("POST", "/api/pricelists", payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricelists/latest'] });
      toast({
        title: "Price list created",
        description: "Your first price list has been created successfully",
      });
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast({
        title: "Creation failed",
        description: error.message || "Failed to create price list",
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const csvData = results.data;

        // Validate CSV has data
        if (!headers.length || !csvData.length) {
          toast({
            title: "Empty CSV file",
            description: "The CSV file contains no data. Please upload a valid file.",
            variant: "destructive",
          });
          setIsUploading(false);
          return;
        }

        // Use company default field mapping if available, otherwise auto-detect
        let fieldMapping: FieldMapping;
        
        if (companyDefaults?.defaultFieldMapping) {
          fieldMapping = companyDefaults.defaultFieldMapping;
        } else {
          // Auto-detect field mapping
          fieldMapping = {
            product: headers.find((h) => /product|name|item/i.test(h)) || "",
            sku: headers.find((h) => /sku|code|id/i.test(h)) || "",
            format: headers.find((h) => /format|size|volume/i.test(h)) || "",
            price: headers.find((h) => /price|cost|amount/i.test(h)) || "",
            category: headers.find((h) => /category|type|brand/i.test(h)) || "",
            notes: headers.find((h) => /note|description|comment/i.test(h)) || "",
            productImageUrl: headers.find((h) => /image|photo|picture|url/i.test(h)) || "",
          };
        }

        // Map CSV data to products
        const products: Product[] = csvData.map((row: any, index: number) => ({
          id: `product-${index}`,
          product: fieldMapping.product ? row[fieldMapping.product] || "Unnamed Product" : "Unnamed Product",
          sku: fieldMapping.sku ? row[fieldMapping.sku] || "" : "",
          format: fieldMapping.format ? row[fieldMapping.format] || "" : "",
          price: fieldMapping.price ? row[fieldMapping.price] || "" : "",
          category: fieldMapping.category ? row[fieldMapping.category] || "" : "",
          notes: fieldMapping.notes ? row[fieldMapping.notes] || "" : "",
          productImageUrl: fieldMapping.productImageUrl ? row[fieldMapping.productImageUrl] || "" : "",
        }));

        // Validate we have products
        if (products.length === 0) {
          toast({
            title: "No products found",
            description: "The CSV file contains no valid product data.",
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

  const handleDownloadPDF = async () => {
    if (!latestPricelist) return;

    setIsGeneratingPDF(true);
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
        title: "PDF Generated",
        description: "Your price list has been downloaded",
      });
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({
        title: "Download Failed",
        description: error.message || "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Empty state (no pricelist yet)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b print:hidden">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold">Price List Generator</h1>
            </div>
            <UserProfileMenu />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 text-muted-foreground animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !latestPricelist) {
    // Empty state - no pricelist yet
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b print:hidden">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold">Price List Generator</h1>
            </div>
            <UserProfileMenu />
          </div>
        </header>
        <main className="container mx-auto px-4 py-12 max-w-3xl">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Welcome to Price List Generator</CardTitle>
              <CardDescription className="text-base mt-2">
                Create professional, print-ready price lists in seconds. Upload your product CSV file to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover-elevate">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="csv-upload-input"
                  data-testid="input-csv-upload"
                />
                <label
                  htmlFor="csv-upload-input"
                  className="cursor-pointer flex flex-col items-center gap-4"
                >
                  <Upload className="w-16 h-16 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium mb-1">
                      {isUploading ? "Uploading..." : "Create your first price list"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Click to upload or drag and drop your CSV file here
                    </p>
                  </div>
                  {isUploading && (
                    <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                  )}
                </label>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-sm">How it works:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-medium text-foreground">1.</span>
                    Upload a CSV file containing your product data
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-foreground">2.</span>
                    Your company defaults will automatically format the price list
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-foreground">3.</span>
                    Download or print your professional price list
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Main state - pricelist exists
  const products = latestPricelist.products as Product[];
  const branding = latestPricelist.branding as CompanyBranding;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b print:hidden">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Price List Generator</h1>
          </div>
          <UserProfileMenu />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column - Actions */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Current Price List</CardTitle>
                <CardDescription>{latestPricelist.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Products:</span>
                    <span className="font-medium" data-testid="text-product-count">{products.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span className="font-medium text-xs">
                      {new Date(latestPricelist.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Button
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className="w-full"
                    data-testid="button-download-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isGeneratingPDF ? "Generating..." : "Download PDF"}
                  </Button>
                  
                  <Button
                    onClick={handlePrint}
                    variant="outline"
                    className="w-full"
                    data-testid="button-print"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Update Price List</CardTitle>
                <CardDescription>Upload a new CSV to replace current data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-md p-3 border">
                  <p className="text-xs text-muted-foreground mb-1">Current file:</p>
                  <p className="text-sm font-medium truncate" data-testid="text-current-filename">
                    {latestPricelist.name}
                  </p>
                </div>
                
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover-elevate">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="hidden"
                    id="csv-update-input"
                    data-testid="input-csv-update"
                  />
                  <label
                    htmlFor="csv-update-input"
                    className="cursor-pointer flex flex-col items-center gap-3"
                  >
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium mb-1">
                        {isUploading ? "Uploading..." : "Upload New CSV"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Replaces current price list
                      </p>
                    </div>
                    {isUploading && (
                      <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                    )}
                  </label>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column - Preview */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>This is how your price list will appear</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-6 bg-white" id="pricelist-preview">
                  {/* Simple preview of products */}
                  <div className="space-y-4">
                    <div className="text-center border-b pb-4">
                      <h2 className="text-2xl font-bold">{branding.companyName}</h2>
                      {branding.tagline && (
                        <p className="text-muted-foreground">{branding.tagline}</p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-muted-foreground">
                        Products ({products.length})
                      </h3>
                      <div className="space-y-1 max-h-[600px] overflow-y-auto">
                        {products.slice(0, 10).map((product) => (
                          <div
                            key={product.id}
                            className="flex justify-between items-center p-2 border-b text-sm"
                            data-testid={`preview-product-${product.id}`}
                          >
                            <div className="flex-1">
                              <p className="font-medium">{product.product}</p>
                              {product.format && (
                                <p className="text-xs text-muted-foreground">{product.format}</p>
                              )}
                            </div>
                            <p className="font-medium">{product.price}</p>
                          </div>
                        ))}
                        {products.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            ... and {products.length - 10} more products
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
