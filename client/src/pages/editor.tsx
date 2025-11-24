import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, FileText, Settings, Eye, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { CSVUpload } from "@/components/csv-upload";
import { ConfigurationPanel } from "@/components/configuration-panel";
import { TemplateSelector } from "@/components/template-selector";
import { FieldMappingPanel } from "@/components/field-mapping-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { SavePricelistDialog } from "@/components/save-pricelist-dialog";
import { CollectionEditor } from "@/components/collection-editor";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { stripHtml } from "@/lib/text-utils";
import { parseCollection, extractWineTypeFromProductName, type BrandRegistryEntry } from "@/lib/collection-parser";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, FieldMapping, Pricelist, Template, BrandRegistry } from "@shared/schema";

export default function Editor() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const pricelistId = urlParams.get('id') ? parseInt(urlParams.get('id')!) : null;
  const { toast } = useToast();
  const { user } = useAuth();
  const [csvData, setCSVData] = useState<any[]>([]);
  const [csvHeaders, setCSVHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    product: "",
    sku: "",
    format: "",
    price: "",
    category: "",
    notes: "",
    productImageUrl: "",
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [companyBranding, setCompanyBranding] = useState<CompanyBranding>({
    companyName: "Your Company Name",
    tagline: "Quality Products",
  });
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [qrCodeConfig, setQRCodeConfig] = useState<QRCodeConfig | undefined>();
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [currentPricelistId, setCurrentPricelistId] = useState<number | null>(null);
  const [currentPricelistName, setCurrentPricelistName] = useState<string>("");
  const [currentPricelistDescription, setCurrentPricelistDescription] = useState<string>("");
  const [template, setTemplate] = useState<Template>("modern");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // null = ALL categories
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  // For super admins, load list of companies
  const { data: companies, isLoading: isLoadingCompanies } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/companies'],
    enabled: user?.role === 'superAdmin',
  });

  // Auto-select first company if Super Admin hasn't selected one yet (only for new pricelists)
  useEffect(() => {
    if (user?.role === 'superAdmin' && !pricelistId && !selectedCompanyId && companies && companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [user, pricelistId, selectedCompanyId, companies]);

  // Determine which company to use for defaults
  const companyIdForDefaults = user?.role === 'superAdmin' 
    ? selectedCompanyId 
    : user?.companyId;

  // Debug logging
  console.log('[Editor] User role:', user?.role);
  console.log('[Editor] Selected company ID:', selectedCompanyId);
  console.log('[Editor] Company ID for defaults:', companyIdForDefaults);
  console.log('[Editor] Pricelist ID:', pricelistId);
  console.log('[Editor] Companies loaded:', companies?.length);

  // Load company defaults for new pricelists
  const { data: companyDefaults, isLoading: isLoadingDefaults, error: defaultsError } = useQuery<{
    defaultTemplate: Template;
    defaultFieldMapping: FieldMapping | null;
    defaultBranding: CompanyBranding | null;
  }>({
    queryKey: ['/api/companies/defaults', { companyId: companyIdForDefaults }],
    queryFn: async () => {
      // Only super admins can query with a specific companyId
      const url = user?.role === 'superAdmin' && companyIdForDefaults
        ? `/api/companies/defaults?companyId=${companyIdForDefaults}`
        : '/api/companies/defaults';
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch company defaults');
      }
      
      return response.json();
    },
    enabled: pricelistId === null && companyIdForDefaults !== null, // Only fetch for new pricelists with a company
  });

  // Load pricelist from query params (for editing)
  const { data: loadedPricelist } = useQuery<Pricelist>({
    queryKey: pricelistId ? ['/api/pricelists', pricelistId] : [],
    enabled: !!pricelistId,
  });

  // Determine which company to use for brand registry
  // When editing a pricelist, use the pricelist's company
  // When creating new as super admin, use selected company
  // Otherwise use user's company
  const companyIdForBrands = loadedPricelist?.companyId || companyIdForDefaults;

  // Load brand registry for the current company
  const { data: brandRegistry } = useQuery<BrandRegistry[]>({
    queryKey: ['/api/brands', { companyId: companyIdForBrands }],
    queryFn: async () => {
      // Only super admins can query with a specific companyId
      const url = user?.role === 'superAdmin' && companyIdForBrands
        ? `/api/brands?companyId=${companyIdForBrands}`
        : '/api/brands';
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch brand registry');
      }
      
      return response.json();
    },
  });

  // Effect to populate form when pricelist is loaded (editing mode)
  useEffect(() => {
    if (loadedPricelist) {
      setCurrentPricelistId(loadedPricelist.id);
      setCurrentPricelistName(loadedPricelist.name);
      setCurrentPricelistDescription(loadedPricelist.description || "");
      setCompanyBranding(loadedPricelist.branding);
      setSalesAgents(loadedPricelist.salesAgents as SalesAgent[]);
      setQRCodeConfig(loadedPricelist.qrCode as QRCodeConfig | undefined);
      setProducts(loadedPricelist.products as Product[]);
      if (loadedPricelist.fieldMapping) {
        setFieldMapping(loadedPricelist.fieldMapping as FieldMapping);
      }
      setTemplate(loadedPricelist.template as Template);
      setCategoryFilter(loadedPricelist.categoryFilter || null);
      
      // For super admins editing a pricelist, preload the company selection
      if (user?.role === 'superAdmin' && loadedPricelist.companyId) {
        setSelectedCompanyId(loadedPricelist.companyId);
      }
      
      setActiveTab("preview");
    }
  }, [loadedPricelist, user?.role]);

  // Effect to apply company defaults for new pricelists
  useEffect(() => {
    if (companyDefaults && !pricelistId) {
      // Apply default template
      if (companyDefaults.defaultTemplate) {
        setTemplate(companyDefaults.defaultTemplate);
      }
      
      // Apply default branding only if it has actual values (not just normalized empty strings)
      if (companyDefaults.defaultBranding && companyDefaults.defaultBranding.companyName) {
        setCompanyBranding(companyDefaults.defaultBranding);
      }
    }
  }, [companyDefaults, pricelistId]);

  // Effect to handle company defaults error
  useEffect(() => {
    if (defaultsError) {
      toast({
        title: "Failed to load company defaults",
        description: "Using auto-detection for field mapping",
        variant: "destructive",
      });
    }
  }, [defaultsError, toast]);

  const handleCSVUpload = (data: any[], headers: string[]) => {
    console.log('[handleCSVUpload] ===== CSV UPLOAD STARTED =====');
    console.log('[handleCSVUpload] CSV Headers:', headers);
    console.log('[handleCSVUpload] CSV Row Count:', data.length);
    console.log('[handleCSVUpload] Company defaults:', companyDefaults);
    console.log('[handleCSVUpload] Default field mapping:', companyDefaults?.defaultFieldMapping);
    console.log('[handleCSVUpload] Loaded pricelist:', loadedPricelist ? 'EXISTS' : 'NULL');
    console.log('[handleCSVUpload] Loaded pricelist field mapping:', loadedPricelist?.fieldMapping);
    console.log('[handleCSVUpload] Current field mapping state:', fieldMapping);
    
    setCSVData(data);
    setCSVHeaders(headers);
    
    // Use field mapping from: 1) company defaults (new pricelist), 2) loaded pricelist (editing), or 3) auto-detect
    let mappingToUse: FieldMapping;
    let source = "auto-detection";
    
    // Priority 1: Company defaults (for new pricelists)
    if (companyDefaults?.defaultFieldMapping) {
      mappingToUse = {
        product: companyDefaults.defaultFieldMapping.product || "",
        sku: companyDefaults.defaultFieldMapping.sku || "",
        format: companyDefaults.defaultFieldMapping.format || "",
        price: companyDefaults.defaultFieldMapping.price || "",
        category: companyDefaults.defaultFieldMapping.category || "",
        notes: companyDefaults.defaultFieldMapping.notes || "",
        productImageUrl: companyDefaults.defaultFieldMapping.productImageUrl || "",
      };
      source = "company defaults";
    } 
    // Priority 2: Loaded pricelist's field mapping (when editing existing pricelist)
    else if (loadedPricelist?.fieldMapping) {
      mappingToUse = {
        product: (loadedPricelist.fieldMapping as any).product || "",
        sku: (loadedPricelist.fieldMapping as any).sku || "",
        format: (loadedPricelist.fieldMapping as any).format || "",
        price: (loadedPricelist.fieldMapping as any).price || "",
        category: (loadedPricelist.fieldMapping as any).category || "",
        notes: (loadedPricelist.fieldMapping as any).notes || "",
        productImageUrl: (loadedPricelist.fieldMapping as any).productImageUrl || "",
      };
      source = "saved pricelist";
    } 
    // Priority 3: Current field mapping state (if already set)
    else if (fieldMapping.product || fieldMapping.sku) {
      mappingToUse = fieldMapping;
      source = "current state";
    } 
    // Fallback: Auto-detect
    else {
      // Auto-detect common field mappings
      mappingToUse = {
        product: headers.find(h => {
          const lower = h.toLowerCase();
          return lower === "name" || (lower.includes("product") && !lower.includes("image"));
        }) || "",
        sku: headers.find(h => h.toLowerCase().includes("sku")) || "",
        format: headers.find(h => {
          const lower = h.toLowerCase();
          return lower.includes("additional info") || lower.includes("case") || lower.includes("format") || lower.includes("size");
        }) || "",
        price: headers.find(h => h.toLowerCase().includes("price")) || "",
        category: headers.find(h => h.toLowerCase().includes("category") || h.toLowerCase().includes("producer") || h.toLowerCase().includes("winery")) || "",
        notes: headers.find(h => h.toLowerCase().includes("note")) || "",
        productImageUrl: headers.find(h => {
          const lower = h.toLowerCase();
          return lower.includes("productimage") || lower === "productimageurl";
        }) || "",
      };
    }
    
    console.log('[handleCSVUpload] Using field mapping from:', source);
    console.log('[handleCSVUpload] Mapping to use:', mappingToUse);
    
    setFieldMapping(mappingToUse);
    
    // Show toast to user about where mapping came from
    if (source !== "auto-detection") {
      toast({
        title: "Field mapping applied",
        description: `Using field mapping from ${source}`,
      });
    }
    
    setActiveTab("mapping");
  };

  const handleApplyMapping = () => {
    // Build a map of existing products by SKU to preserve hidden state
    const existingProductsBySKU = new Map<string, Product>();
    if (loadedPricelist?.products) {
      loadedPricelist.products.forEach((product: Product) => {
        if (product.sku) {
          existingProductsBySKU.set(product.sku, product);
        }
      });
    }

    const mappedProducts: Product[] = csvData.map((row, index) => {
      let imageUrl = fieldMapping.productImageUrl ? row[fieldMapping.productImageUrl] || "" : "";
      
      // Auto-complete Wix image URLs if only filename is provided
      if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        imageUrl = `https://static.wixstatic.com/media/${imageUrl}`;
      }
      
      // Extract case size from "Additional info sections" if it contains "CASE SIZE"
      let format = fieldMapping.format ? row[fieldMapping.format] || "" : "";
      if (format && format.includes('CASE SIZE')) {
        const lines = format.split('\n');
        const caseSizeIndex = lines.findIndex((line: string) => line.trim().toUpperCase() === 'CASE SIZE');
        if (caseSizeIndex !== -1 && caseSizeIndex + 1 < lines.length) {
          format = lines[caseSizeIndex + 1].trim();
        }
      }
      
      // Parse collection field if available to extract brand name and categorization
      let category = stripHtml(fieldMapping.category ? row[fieldMapping.category] || "" : "");
      const collectionField = fieldMapping.category ? row[fieldMapping.category] : null;
      
      let collectionRaw: string | undefined;
      let collectionCategory: 'cider' | 'wine' | 'spirits' | 'nonAlc' | undefined;
      let collectionType: string | undefined;
      let collectionBrand: string | undefined;
      let collectionRegion: string | undefined;
      
      if (collectionField) {
        // Convert brand registry to the format expected by parseCollection
        const brandRegistryEntries: BrandRegistryEntry[] = (brandRegistry || []).map(b => ({
          brandName: b.brandName,
          category: b.category as 'cider' | 'wine' | 'spirits' | 'nonAlc',
          displayOrder: b.displayOrder,
        }));
        const parsed = parseCollection(collectionField, brandRegistryEntries);
        if (parsed) {
          // Use sortKey as category - it contains brand name with sorting prefix
          category = parsed.sortKey;
          
          // Store parsed collection components
          collectionRaw = collectionField;
          collectionCategory = parsed.primaryCategory;
          collectionType = parsed.wineType;
          collectionBrand = parsed.brand;
          collectionRegion = parsed.region;
        }
      }
      
      // Get SKU for reconciliation
      const sku = stripHtml(row[fieldMapping.sku] || "");
      
      // Get product name (we'll need it for fallback wine type extraction)
      const productName = stripHtml(row[fieldMapping.product] || "");
      
      // FALLBACK: If collectionType is not set but category is wine or nonAlc,
      // try to extract wine type from product name (common for non-alcoholic wines)
      if (!collectionType && (collectionCategory === 'wine' || collectionCategory === 'nonAlc')) {
        collectionType = extractWineTypeFromProductName(productName);
      }
      
      // Check if this product exists in the previous pricelist (by SKU)
      const existingProduct = existingProductsBySKU.get(sku);
      const isHidden = existingProduct?.isHidden ?? false;
      
      // Strip HTML tags from all text fields (Wix exports include HTML markup)
      return {
        id: `product-${index}`,
        category,
        notes: stripHtml(fieldMapping.notes ? row[fieldMapping.notes] || "" : ""),
        product: productName,
        sku,
        format: stripHtml(format),
        price: stripHtml(row[fieldMapping.price] || ""),
        productImageUrl: imageUrl,
        isHidden, // Preserve hidden state from previous pricelist
        collectionRaw,
        collectionCategory,
        collectionType,
        collectionBrand,
        collectionRegion,
      };
    });

    setProducts(mappedProducts);
    setActiveTab("collection");
  };

  const saveMutation = useMutation({
    mutationFn: async ({ name, description, companyId }: { name: string; description?: string; companyId?: number }) => {
      console.log("Mutation: Starting mutation with:", { name, description, companyId, productsCount: products.length });
      console.log("Mutation: Current branding state:", JSON.stringify(companyBranding, null, 2));
      
      // Build payload with all required fields
      const payload: any = {
        name,
        description,
        branding: companyBranding,
        salesAgents,
        qrCode: qrCodeConfig,
        products,
        fieldMapping,
        template,
        categoryFilter: categoryFilter ?? null,
      };
      
      // CRITICAL: Include companyId in payload if provided (for super admins)
      if (companyId !== undefined) {
        payload.companyId = companyId;
        console.log("Mutation: Including companyId in payload:", companyId);
      }

      console.log("Mutation: Payload branding:", JSON.stringify(payload.branding, null, 2));
      console.log("Mutation: Payload companyId:", payload.companyId);
      console.log("Mutation: Payload size:", JSON.stringify(payload).length, "bytes");

      if (currentPricelistId) {
        console.log("Mutation: Updating existing pricelist", currentPricelistId);
        const res = await apiRequest("PATCH", `/api/pricelists/${currentPricelistId}`, payload);
        const data = await res.json();
        console.log("Mutation: PATCH response:", data);
        return data;
      } else {
        console.log("Mutation: Creating new pricelist");
        const res = await apiRequest("POST", "/api/pricelists", payload);
        console.log("Mutation: POST response status:", res.status);
        const data = await res.json();
        console.log("Mutation: POST response data:", data);
        return data;
      }
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricelists"] });
      setCurrentPricelistId(data.id);
      setCurrentPricelistName(variables.name);
      setCurrentPricelistDescription(variables.description || "");
      toast({
        title: currentPricelistId ? "Pricelist updated" : "Pricelist saved",
        description: "Your pricelist has been saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save pricelist",
        variant: "destructive",
      });
    },
  });

  // Allow saving as long as products exist - fallback chain in dialog will handle name generation
  // Super admins must select a company before saving and companies must be loaded
  const canSave = products.length > 0 && (
    user?.role !== 'superAdmin' || (
      !isLoadingCompanies && 
      (selectedCompanyId !== null || currentPricelistId !== null)
    )
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Pricelist Editor</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentPricelistId ? `Editing: ${currentPricelistName}` : "Create a new pricelist"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setSaveDialogOpen(true)}
                disabled={!canSave}
                data-testid="button-save-pricelist"
              >
                <Save className="w-4 h-4 mr-2" />
                {currentPricelistId ? "Update" : "Save"}
              </Button>
              <UserProfileMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Company Selector for Super Admins */}
      {user?.role === 'superAdmin' && !pricelistId && (
        <div className="bg-accent/20 border-b">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4 max-w-md">
              <Label htmlFor="company-selector" className="text-sm font-medium whitespace-nowrap">
                Select Company:
              </Label>
              <Select
                value={selectedCompanyId?.toString() || ""}
                onValueChange={(value) => setSelectedCompanyId(value ? parseInt(value) : null)}
              >
                <SelectTrigger 
                  id="company-selector" 
                  className="flex-1"
                  data-testid="select-company-for-editor"
                >
                  <SelectValue placeholder="Choose a company to load defaults..." />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((company) => (
                    <SelectItem 
                      key={company.id} 
                      value={company.id.toString()}
                      data-testid={`company-option-${company.id}`}
                    >
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedCompanyId && (
              <p className="text-xs text-muted-foreground mt-2">
                Field mapping, branding, and templates will be loaded from this company's defaults.
              </p>
            )}
          </div>
        </div>
      )}

      <SavePricelistDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        companyBranding={companyBranding}
        onSave={async (name, description, companyId) => {
          // Use the company ID from the dialog (for super admins) or the selected company or loaded pricelist
          const finalCompanyId = companyId || selectedCompanyId || loadedPricelist?.companyId || undefined;
          
          // Validate super admins have a company ID
          if (user?.role === 'superAdmin' && !finalCompanyId) {
            toast({
              title: "Company Required",
              description: "Please select a company before saving",
              variant: "destructive",
            });
            return;
          }
          
          await saveMutation.mutateAsync({ name, description, companyId: finalCompanyId });
        }}
        initialName={currentPricelistName}
        initialDescription={currentPricelistDescription}
        user={user}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-5">
            <TabsTrigger value="upload" data-testid="tab-upload" className="gap-2 text-xs">
              <Upload className="w-4 h-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger 
              value="mapping" 
              data-testid="tab-mapping"
              disabled={csvHeaders.length === 0}
              className="gap-2 text-xs"
            >
              <FileText className="w-4 h-4" />
              Map Fields
            </TabsTrigger>
            <TabsTrigger 
              value="collection" 
              data-testid="tab-collection"
              disabled={products.length === 0}
              className="gap-2 text-xs"
            >
              <FileText className="w-4 h-4" />
              Review
            </TabsTrigger>
            <TabsTrigger 
              value="config" 
              data-testid="tab-config"
              disabled={products.length === 0}
              className="gap-2 text-xs"
            >
              <Settings className="w-4 h-4" />
              Configure
            </TabsTrigger>
            <TabsTrigger 
              value="preview" 
              data-testid="tab-preview"
              disabled={products.length === 0}
              className="gap-2 text-xs"
            >
              <Eye className="w-4 h-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            {isLoadingDefaults && pricelistId === null ? (
              <div className="text-center py-12" data-testid="loading-company-defaults">
                <p className="text-sm text-muted-foreground">Loading company defaults...</p>
              </div>
            ) : user?.role === 'superAdmin' && !selectedCompanyId && !pricelistId ? (
              <div className="text-center py-12 space-y-4" data-testid="select-company-prompt">
                <p className="text-muted-foreground">Please select a company above to load field mapping defaults.</p>
                <p className="text-xs text-muted-foreground">This ensures CSV columns are mapped correctly.</p>
              </div>
            ) : (
              <CSVUpload onUpload={handleCSVUpload} />
            )}
          </TabsContent>

          <TabsContent value="mapping" className="space-y-6">
            <FieldMappingPanel
              headers={csvHeaders}
              mapping={fieldMapping}
              onMappingChange={setFieldMapping}
              onApply={handleApplyMapping}
              previewData={csvData.slice(0, 3)}
            />
          </TabsContent>

          <TabsContent value="collection" className="space-y-6">
            <CollectionEditor
              products={products}
              onProductsChange={setProducts}
            />
            <div className="flex justify-end" data-testid="container-continue-button">
              <Button
                onClick={() => setActiveTab("config")}
                data-testid="button-continue-to-config"
              >
                Continue to Configuration
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="config" className="space-y-6">
            <TemplateSelector value={template} onChange={setTemplate} />
            <ConfigurationPanel
              branding={companyBranding}
              salesAgents={salesAgents}
              qrCodeConfig={qrCodeConfig}
              products={products}
              categoryFilter={categoryFilter}
              onBrandingChange={setCompanyBranding}
              onSalesAgentsChange={setSalesAgents}
              onQRCodeChange={setQRCodeConfig}
              onCategoryFilterChange={setCategoryFilter}
              onContinue={() => setActiveTab("preview")}
            />
          </TabsContent>

          <TabsContent value="preview" className="space-y-6">
            <PreviewPanel
              products={products}
              branding={companyBranding}
              salesAgents={salesAgents}
              qrCodeConfig={qrCodeConfig}
              template={template}
              pricelistName={currentPricelistName}
              categoryFilter={categoryFilter}
              brandRegistry={brandRegistry}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
