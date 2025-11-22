import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, FileText, Settings, Eye, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { CSVUpload } from "@/components/csv-upload";
import { ConfigurationPanel } from "@/components/configuration-panel";
import { TemplateSelector } from "@/components/template-selector";
import { FieldMappingPanel } from "@/components/field-mapping-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { SavePricelistDialog } from "@/components/save-pricelist-dialog";
import { CollectionEditor } from "@/components/collection-editor";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { stripHtml } from "@/lib/text-utils";
import { parseCollection, extractWineTypeFromProductName, type BrandRegistryEntry } from "@/lib/collection-parser";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, FieldMapping, Pricelist, Template, BrandRegistry } from "@shared/schema";

export default function Editor() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const pricelistId = urlParams.get('id') ? parseInt(urlParams.get('id')!) : null;
  const { toast } = useToast();
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

  // Load company defaults for new pricelists
  const { data: companyDefaults, isLoading: isLoadingDefaults, error: defaultsError } = useQuery<{
    defaultTemplate: Template;
    defaultFieldMapping: FieldMapping | null;
    defaultBranding: CompanyBranding | null;
  }>({
    queryKey: ['/api/companies/defaults'],
    enabled: pricelistId === null, // Only fetch for new pricelists (not editing)
  });

  // Load pricelist from query params (for editing)
  const { data: loadedPricelist } = useQuery<Pricelist>({
    queryKey: pricelistId ? ['/api/pricelists', pricelistId] : [],
    enabled: !!pricelistId,
  });

  // Load brand registry for the current company
  const { data: brandRegistry } = useQuery<BrandRegistry[]>({
    queryKey: ['/api/brands'],
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
      setActiveTab("preview");
    }
  }, [loadedPricelist]);

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
    setCSVData(data);
    setCSVHeaders(headers);
    
    // Use company default field mapping if available, otherwise auto-detect
    let mappingToUse: FieldMapping;
    
    if (companyDefaults?.defaultFieldMapping) {
      // Use company's saved field mapping
      mappingToUse = {
        product: companyDefaults.defaultFieldMapping.product || "",
        sku: companyDefaults.defaultFieldMapping.sku || "",
        format: companyDefaults.defaultFieldMapping.format || "",
        price: companyDefaults.defaultFieldMapping.price || "",
        category: companyDefaults.defaultFieldMapping.category || "",
        notes: companyDefaults.defaultFieldMapping.notes || "",
        productImageUrl: companyDefaults.defaultFieldMapping.productImageUrl || "",
      };
      toast({
        title: "Company field mapping applied",
        description: "Using your company's default CSV field mapping",
      });
    } else {
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
    
    setFieldMapping(mappingToUse);
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
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      console.log("Mutation: Starting mutation with:", { name, description, productsCount: products.length });
      console.log("Mutation: Current branding state:", JSON.stringify(companyBranding, null, 2));
      const payload = {
        name,
        description,
        branding: companyBranding,
        salesAgents,
        qrCode: qrCodeConfig,
        products,
        fieldMapping,
        template,
        categoryFilter: categoryFilter ?? null, // Explicitly send null instead of undefined
      };

      console.log("Mutation: Payload branding:", JSON.stringify(payload.branding, null, 2));
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
  const canSave = products.length > 0;

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

      <SavePricelistDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        companyBranding={companyBranding}
        onSave={async (name, description) => {
          await saveMutation.mutateAsync({ name, description });
        }}
        initialName={currentPricelistName}
        initialDescription={currentPricelistDescription}
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
