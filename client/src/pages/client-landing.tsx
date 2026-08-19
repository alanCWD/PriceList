import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, Download, Printer, RefreshCw, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { generatePDF } from "@/lib/pdf-generator";
import { stripHtml } from "@/lib/text-utils";
import { useViewMode } from "@/contexts/ViewModeContext";
import { reconcileProductIdsBySku } from "@shared/product-reconciliation";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, FieldMapping, Pricelist, Template, BrandRegistry } from "@shared/schema";
import Papa from "papaparse";

export default function ClientLanding() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { impersonatedCompanyId, setImpersonatedCompanyId } = useViewMode();
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  
  // For super admins, load list of companies
  const { data: companies } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/companies'],
    enabled: user?.role === 'superAdmin',
  });
  
  // REMOVED: Auto-select first company - Super Admins MUST explicitly select a company
  // This prevents accidentally using wrong company's brand registry and hidden SKUs
  // The company selector is displayed in the header for Super Admins to choose

  // Fetch latest pricelist (includes impersonatedCompanyId in queryKey to refetch when company changes)
  // Use short staleTime to ensure fresh data on each visit
  const { data: latestPricelist, isLoading, error } = useQuery<Pricelist>({
    queryKey: ['/api/pricelists/latest', { impersonatedCompanyId }],
    queryFn: async () => {
      const url = impersonatedCompanyId 
        ? `/api/pricelists/latest?companyId=${impersonatedCompanyId}`
        : '/api/pricelists/latest';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch pricelist');
      return response.json();
    },
    enabled: impersonatedCompanyId !== null || user?.role !== 'superAdmin',
    staleTime: 0, // Always consider data stale to ensure fresh fetch
    refetchOnMount: true, // Refetch when component mounts
  });

  // Fetch company defaults for field mapping (includes impersonatedCompanyId in queryKey to refetch when company changes)
  const { data: companyDefaults } = useQuery<{
    defaultTemplate: Template;
    defaultFieldMapping: FieldMapping | null;
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
    enabled: !!user && (impersonatedCompanyId !== null || user.role !== 'superAdmin'),
  });

  // CRITICAL: Use the pricelist's companyId for brand registry and hidden SKUs
  // This ensures we always use the correct company's data when viewing a pricelist
  // even if Super Admin is impersonating a different company
  const pricelistCompanyId = latestPricelist?.companyId || impersonatedCompanyId;

  // Fetch brand ordering data for manual product ordering (client-accessible endpoint)
  // Returns category, displayOrder for brand sorting, productOrder for product sorting, and skus for SKU-based matching
  const { data: brandOrderingData, isLoading: isBrandOrderingLoading, isError: isBrandOrderingError } = useQuery<{ 
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
    enabled: pricelistCompanyId !== null || user?.role !== 'superAdmin',
  });

  // Fetch hidden SKUs for persistent visibility across CSV re-uploads
  // CRITICAL: Use pricelist's companyId, not impersonated company
  const { data: hiddenSkus } = useQuery<string[]>({
    queryKey: ['/api/visibility/hidden-skus', { companyId: pricelistCompanyId }],
    queryFn: async () => {
      const url = pricelistCompanyId 
        ? `/api/visibility/hidden-skus?companyId=${pricelistCompanyId}`
        : '/api/visibility/hidden-skus';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch hidden SKUs');
      return response.json();
    },
    enabled: pricelistCompanyId !== null || user?.role !== 'superAdmin',
  });

  // Build SKU→Brand map from brand ordering data for consistent brand matching
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

  // Create a Set of hidden SKUs for efficient lookup (authoritative source from visibility table)
  const hiddenSkusSet = useMemo(() => new Set(hiddenSkus || []), [hiddenSkus]);

  // Check if a product is hidden using the authoritative visibility table ONLY.
  // We do NOT fall back to product.isHidden (from saved pricelist JSON) because
  // that field can be stale if a user un-hides a product after the pricelist was saved.
  const isProductHidden = (product: Product): boolean => {
    if (!product.sku) return false;
    return hiddenSkusSet.has(product.sku);
  };

  // SKU-only matching: product must have a SKU in the brand registry
  const matchProductToBrand = (product: Product): string | null => {
    if (product.sku && skuToBrandMap.has(product.sku)) {
      return skuToBrandMap.get(product.sku)!;
    }
    return null;
  };

  // Extract unique brands from visible products using SKU-only matching
  // Products only appear if their SKU exists in the brand registry
  const uniqueBrands = useMemo(() => {
    if (!latestPricelist?.products) return [];
    
    const products = latestPricelist.products as Product[];
    const visibleProducts = products.filter(p => !isProductHidden(p));
    const brandSet = new Set<string>();
    
    visibleProducts.forEach(product => {
      const matchedBrand = matchProductToBrand(product);
      if (matchedBrand) {
        brandSet.add(matchedBrand);
      }
    });
    
    // Convert to array and sort alphabetically
    return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
  }, [latestPricelist?.products, skuToBrandMap, hiddenSkusSet]);

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
            notes: headers.find((h) => /^notes$|note|additionalinfodescription2/i.test(h)) || "",
            productImageUrl: headers.find((h) => /image|photo|picture|url/i.test(h)) || "",
          };
        }

        // Build set of hidden SKUs from the persistent visibility table
        const hiddenSkusSet = new Set<string>(hiddenSkus || []);

        // Map CSV data to products and strip HTML tags (for Wix exports)
        const importedProducts: Product[] = csvData.map((row: any, index: number) => {
          let imageUrl = fieldMapping.productImageUrl ? row[fieldMapping.productImageUrl] || "" : "";
          
          // Auto-complete Wix image URLs if only filename is provided
          if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            imageUrl = `https://static.wixstatic.com/media/${imageUrl}`;
          }
          
          // Get SKU for reconciliation
          const sku = stripHtml(fieldMapping.sku ? row[fieldMapping.sku] || "" : "");
          
          // Determine visibility using visibility table as authoritative source.
          // We do NOT fall back to existingProduct.isHidden — that value can be stale
          // if a user un-hides a product after the pricelist was saved.
          const isHidden = sku ? hiddenSkusSet.has(sku) : false;
          
          return {
            id: `product-${index}`,
            product: stripHtml(fieldMapping.product ? row[fieldMapping.product] || "Unnamed Product" : "Unnamed Product"),
            sku,
            format: stripHtml(fieldMapping.format ? row[fieldMapping.format] || "" : ""),
            price: stripHtml(fieldMapping.price ? row[fieldMapping.price] || "" : ""),
            category: stripHtml(fieldMapping.category ? row[fieldMapping.category] || "" : ""),
            notes: stripHtml(fieldMapping.notes ? row[fieldMapping.notes] || "" : ""),
            productImageUrl: imageUrl,
            isHidden, // Preserve hidden state from visibility table or existing pricelist
          };
        });

        const reconciliation = reconcileProductIdsBySku(
          (latestPricelist?.products as Product[] | undefined) || [],
          importedProducts,
        );
        if (reconciliation.duplicateSkus.length > 0) {
          toast({
            title: "Duplicate SKUs in upload",
            description: `Fix the duplicate SKU${reconciliation.duplicateSkus.length === 1 ? "" : "s"} before uploading: ${reconciliation.duplicateSkus.join(", ")}`,
            variant: "destructive",
          });
          setIsUploading(false);
          return;
        }
        const products = reconciliation.products;

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
          
          // Build branding from all company defaults, including colors
          const branding: CompanyBranding = {
            ...companyDefaults.defaultBranding,
            companyName: companyDefaults.defaultBranding.companyName.trim(),
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

    // Block PDF generation if brand ordering data failed to load
    if (isBrandOrderingError) {
      toast({
        title: "Cannot generate PDF",
        description: "Failed to load product ordering data. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPDF(true);
    try {
      // Filter out hidden products using authoritative visibility table
      const allProducts = latestPricelist.products as Product[];
      const visibleProducts = allProducts.filter(p => !isProductHidden(p));
      
      // Debug: Log ribbon data before PDF generation
      const productsWithRibbon = visibleProducts.filter(p => p.ribbon && p.ribbon.trim() !== "");
      const productsWithNotes = visibleProducts.filter(p => p.notes && p.notes.trim() !== "");
      console.log(`[ClientLanding] PDF Download: ${visibleProducts.length} products, ${productsWithRibbon.length} with ribbon, ${productsWithNotes.length} with notes`);
      if (productsWithRibbon.length > 0) {
        console.log(`[ClientLanding] Sample ribbon data:`, productsWithRibbon.slice(0, 3).map(p => ({ sku: p.sku, ribbon: p.ribbon, notes: p.notes })));
      } else {
        // Check if any products have ribbon property at all
        const sampleProducts = visibleProducts.slice(0, 3);
        console.log(`[ClientLanding] No ribbon data found. Sample products:`, sampleProducts.map(p => ({ sku: p.sku, ribbon: p.ribbon, notes: p.notes, keys: Object.keys(p) })));
      }
      
      await generatePDF({
        products: visibleProducts,
        branding: latestPricelist.branding as CompanyBranding,
        salesAgents: latestPricelist.salesAgents as SalesAgent[],
        qrCodeConfig: latestPricelist.qrCode as QRCodeConfig | undefined,
        template: latestPricelist.template as Template,
        pricelistName: latestPricelist.name,
        brandRegistry: brandOrderingData as any || [], // Pass brand ordering for manual product ordering (only brandName + productOrder needed)
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
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold">Price List Generator</h1>
            </div>
            <div className="flex items-center gap-4">
              {user?.role === 'superAdmin' && companies && companies.length > 0 && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <Select 
                    value={impersonatedCompanyId?.toString() || ""} 
                    onValueChange={(value) => setImpersonatedCompanyId(parseInt(value))}
                  >
                    <SelectTrigger className="w-[200px]" data-testid="select-company">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id.toString()}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <UserProfileMenu />
            </div>
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
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold">Price List Generator</h1>
            </div>
            <div className="flex items-center gap-4">
              {user?.role === 'superAdmin' && companies && companies.length > 0 && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <Select 
                    value={impersonatedCompanyId?.toString() || ""} 
                    onValueChange={(value) => setImpersonatedCompanyId(parseInt(value))}
                  >
                    <SelectTrigger className="w-[200px]" data-testid="select-company">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id.toString()}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <UserProfileMenu />
            </div>
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
  // Filter to only visible products using authoritative visibility table
  const visibleProducts = products.filter(p => !isProductHidden(p));

  // Handler for downloading a single brand
  const handleDownloadBrandPDF = async () => {
    if (!latestPricelist || !selectedBrand) return;

    // Block PDF generation if brand ordering data failed to load
    if (isBrandOrderingError) {
      toast({
        title: "Cannot generate PDF",
        description: "Failed to load product ordering data. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPDF(true);
    try {
      // Filter products by selected brand using SKU-based matching and visibility table
      const allProducts = latestPricelist.products as Product[];
      const brandProducts = allProducts.filter(p => {
        if (isProductHidden(p)) return false;
        const matchedBrand = matchProductToBrand(p);
        return matchedBrand === selectedBrand;
      });
      
      if (brandProducts.length === 0) {
        toast({
          title: "No products found",
          description: `No visible products found for brand "${selectedBrand}"`,
          variant: "destructive",
        });
        setIsGeneratingPDF(false);
        return;
      }
      
      await generatePDF({
        products: brandProducts,
        branding: latestPricelist.branding as CompanyBranding,
        salesAgents: latestPricelist.salesAgents as SalesAgent[],
        qrCodeConfig: latestPricelist.qrCode as QRCodeConfig | undefined,
        template: latestPricelist.template as Template,
        pricelistName: `${latestPricelist.name} - ${selectedBrand}`,
        brandName: selectedBrand,
        brandRegistry: brandOrderingData as any || [],
      });
      
      toast({
        title: "PDF Generated",
        description: `Price list for ${selectedBrand} has been downloaded`,
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

  // Handler for printing a single brand
  const handlePrintBrand = async () => {
    if (!latestPricelist || !selectedBrand) return;

    setIsGeneratingPDF(true);
    try {
      // Filter products by selected brand using SKU-based matching and visibility table
      const allProducts = latestPricelist.products as Product[];
      const brandProducts = allProducts.filter(p => {
        if (isProductHidden(p)) return false;
        const matchedBrand = matchProductToBrand(p);
        return matchedBrand === selectedBrand;
      });
      
      if (brandProducts.length === 0) {
        toast({
          title: "No products found",
          description: `No visible products found for brand "${selectedBrand}"`,
          variant: "destructive",
        });
        setIsGeneratingPDF(false);
        return;
      }
      
      // Detect mobile device
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      // Import jsPDF and generate PDF
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      
      // Create a temporary PDF document and generate it
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "letter",
      });
      
      // Add title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`${latestPricelist.branding.companyName} - ${selectedBrand}`, 40, 40);
      
      // Add table with products
      const tableData = brandProducts.map(p => [
        p.product || "",
        p.sku || "",
        p.format || "",
        p.price || "",
      ]);
      
      autoTable(doc, {
        head: [["Product", "SKU", "Format", "Price"]],
        body: tableData,
        startY: 60,
        margin: { top: 60, right: 40, bottom: 40, left: 40 },
        styles: { fontSize: 10 },
        headStyles: { fillColor: [66, 66, 66] },
      });
      
      if (isMobile) {
        // On mobile, download the PDF - user can print from their PDF viewer
        const sanitizedBrand = selectedBrand.replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`${sanitizedBrand}_pricelist.pdf`);
        toast({
          title: "PDF Downloaded",
          description: "Open the PDF and use Share > Print to print",
        });
      } else {
        // On desktop, open PDF in new window and trigger print dialog
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const printWindow = window.open(pdfUrl, '_blank');
        
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print();
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
          };
        } else {
          toast({
            title: "Print blocked",
            description: "Please allow pop-ups to print pricelists",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({
        title: "Print Failed",
        description: error.message || "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

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
            <div className="flex items-center gap-4">
              {user?.role === 'superAdmin' && companies && companies.length > 0 && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <Select 
                    value={impersonatedCompanyId?.toString() || ""} 
                    onValueChange={(value) => setImpersonatedCompanyId(parseInt(value))}
                  >
                    <SelectTrigger className="w-[200px]" data-testid="select-company">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id.toString()}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <UserProfileMenu />
            </div>
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
              <FileText className="w-12 h-12 mb-4 text-primary" />
              <CardTitle>Professional Output</CardTitle>
              <CardDescription>
                Your company branding and formatting are automatically applied to every pricelist.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Download className="w-12 h-12 mb-4 text-primary" />
              <CardTitle>Export PDF</CardTitle>
              <CardDescription>
                Generate professional, print-ready PDFs instantly with your latest product data.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Super Admin: Company Selection Required */}
        {user?.role === 'superAdmin' && !impersonatedCompanyId && (
          <div className="text-center bg-card border rounded-lg p-12">
            <div className="space-y-6 max-w-md mx-auto">
              <Building2 className="w-16 h-16 mx-auto text-muted-foreground" />
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Select a Company</h3>
                <p className="text-muted-foreground">
                  Please select a company from the dropdown above to view their pricelist and brand registry.
                </p>
              </div>
              {companies && companies.length > 0 && (
                <Select 
                  value="" 
                  onValueChange={(value) => setImpersonatedCompanyId(parseInt(value))}
                >
                  <SelectTrigger className="w-full" data-testid="select-company-prompt">
                    <SelectValue placeholder="Choose a company..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id.toString()}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}

        {/* Pricelist Actions - Only show when company is selected or user is not Super Admin */}
        {(user?.role !== 'superAdmin' || impersonatedCompanyId) && latestPricelist && (
        <div className="text-center bg-card border rounded-lg p-12">
          <div className="space-y-6 max-w-md mx-auto">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Current price list</p>
              <p className="text-lg font-semibold" data-testid="text-current-filename">
                {latestPricelist.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {visibleProducts.length} products · Last updated {new Date(latestPricelist.updatedAt).toLocaleDateString()}
              </p>
            </div>

            <Button
              size="lg"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF || isBrandOrderingLoading}
              className="w-full"
              data-testid="button-download-pdf"
            >
              <Download className="mr-2 h-5 w-5" />
              {isBrandOrderingLoading ? "Loading..." : isGeneratingPDF ? "Generating..." : "Download All Brands"}
            </Button>

            {uniqueBrands.length > 0 && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or Download Single Brand</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                    <SelectTrigger className="w-full" data-testid="select-brand">
                      <SelectValue placeholder="Select a brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueBrands.map((brand) => (
                        <SelectItem key={brand} value={brand} data-testid={`select-item-${brand}`}>
                          {brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      size="lg"
                      onClick={handleDownloadBrandPDF}
                      disabled={isGeneratingPDF || !selectedBrand || isBrandOrderingLoading}
                      className="flex-1 min-w-0"
                      variant="outline"
                      data-testid="button-download-brand-pdf"
                    >
                      <Download className="mr-2 h-5 w-5 shrink-0" />
                      <span className="truncate">{isBrandOrderingLoading ? "Loading..." : isGeneratingPDF ? "Generating..." : "Download"}</span>
                    </Button>
                    <Button
                      size="lg"
                      onClick={handlePrintBrand}
                      disabled={isGeneratingPDF || !selectedBrand}
                      className="flex-1 min-w-0"
                      variant="outline"
                      data-testid="button-print-brand"
                    >
                      <Printer className="mr-2 h-5 w-5 shrink-0" />
                      <span className="truncate">Print</span>
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Update Pricelist</span>
              </div>
            </div>

            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 hover-elevate">
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
                <Upload className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="text-base font-medium mb-1">
                    {isUploading ? "Uploading..." : "Upload New CSV"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Replaces current price list
                  </p>
                </div>
                {isUploading && (
                  <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                )}
              </label>
            </div>
          </div>
        </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()}{" "}
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
