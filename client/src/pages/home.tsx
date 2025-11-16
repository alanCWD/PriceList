import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Upload, FileText, Settings, Eye, Save, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CSVUpload } from "@/components/csv-upload";
import { ConfigurationPanel } from "@/components/configuration-panel";
import { TemplateSelector } from "@/components/template-selector";
import { FieldMappingPanel } from "@/components/field-mapping-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { SavePricelistDialog } from "@/components/save-pricelist-dialog";
import { LoadPricelistDropdown } from "@/components/load-pricelist-dropdown";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, FieldMapping, Pricelist, Template } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const [csvData, setCSVData] = useState<any[]>([]);
  const [csvHeaders, setCSVHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    product: "",
    sku: "",
    format: "",
    price: "",
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

  const handleCSVUpload = (data: any[], headers: string[]) => {
    setCSVData(data);
    setCSVHeaders(headers);
    
    // Auto-detect common field mappings
    const autoMapping: FieldMapping = {
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
    
    setFieldMapping(autoMapping);
    setActiveTab("mapping");
  };

  const handleApplyMapping = () => {
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
        const caseSizeIndex = lines.findIndex(line => line.trim().toUpperCase() === 'CASE SIZE');
        if (caseSizeIndex !== -1 && caseSizeIndex + 1 < lines.length) {
          format = lines[caseSizeIndex + 1].trim();
        }
      }
      
      return {
        id: `product-${index}`,
        category: fieldMapping.category ? row[fieldMapping.category] || "" : "",
        notes: fieldMapping.notes ? row[fieldMapping.notes] || "" : "",
        product: row[fieldMapping.product] || "",
        sku: row[fieldMapping.sku] || "",
        format: format,
        price: row[fieldMapping.price] || "",
        productImageUrl: imageUrl,
      };
    });

    setProducts(mappedProducts);
    setActiveTab("config");
  };

  const saveMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const payload = {
        name,
        description,
        branding: companyBranding,
        salesAgents,
        qrCode: qrCodeConfig,
        products,
        fieldMapping,
        template,
      };

      if (currentPricelistId) {
        return await apiRequest("PATCH", `/api/pricelists/${currentPricelistId}`, payload);
      } else {
        return await apiRequest("POST", "/api/pricelists", payload);
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

  const handleLoadPricelist = (pricelist: Pricelist) => {
    setCurrentPricelistId(pricelist.id);
    setCurrentPricelistName(pricelist.name);
    setCurrentPricelistDescription(pricelist.description || "");
    setCompanyBranding(pricelist.branding);
    setSalesAgents(pricelist.salesAgents as SalesAgent[]);
    setQRCodeConfig(pricelist.qrCode as QRCodeConfig | undefined);
    setProducts(pricelist.products as Product[]);
    if (pricelist.fieldMapping) {
      setFieldMapping(pricelist.fieldMapping as FieldMapping);
    }
    setTemplate(pricelist.template as Template);
    setActiveTab("preview");
  };

  const canSave = products.length > 0 && companyBranding.companyName.trim() !== "";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Pricelist Generator</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create professional, print-ready pricelists from CSV data
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin">
                <Button variant="outline" data-testid="button-admin">
                  <Lock className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              </Link>
              <LoadPricelistDropdown onLoad={handleLoadPricelist} />
              <Button
                onClick={() => setSaveDialogOpen(true)}
                disabled={!canSave}
                data-testid="button-save-pricelist"
              >
                <Save className="w-4 h-4 mr-2" />
                {currentPricelistId ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <SavePricelistDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={async (name, description) => {
          await saveMutation.mutateAsync({ name, description });
        }}
        initialName={currentPricelistName}
        initialDescription={currentPricelistDescription}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4">
            <TabsTrigger value="upload" data-testid="tab-upload" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload CSV
            </TabsTrigger>
            <TabsTrigger 
              value="mapping" 
              data-testid="tab-mapping"
              disabled={csvHeaders.length === 0}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              Map Fields
            </TabsTrigger>
            <TabsTrigger 
              value="config" 
              data-testid="tab-config"
              disabled={products.length === 0}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Configure
            </TabsTrigger>
            <TabsTrigger 
              value="preview" 
              data-testid="tab-preview"
              disabled={products.length === 0}
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <CSVUpload onUpload={handleCSVUpload} />
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

          <TabsContent value="config" className="space-y-6">
            <TemplateSelector value={template} onChange={setTemplate} />
            <ConfigurationPanel
              branding={companyBranding}
              salesAgents={salesAgents}
              qrCodeConfig={qrCodeConfig}
              onBrandingChange={setCompanyBranding}
              onSalesAgentsChange={setSalesAgents}
              onQRCodeChange={setQRCodeConfig}
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
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
