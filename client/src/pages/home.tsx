import { useState } from "react";
import { Upload, FileText, Settings, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CSVUpload } from "@/components/csv-upload";
import { ConfigurationPanel } from "@/components/configuration-panel";
import { FieldMappingPanel } from "@/components/field-mapping-panel";
import { PreviewPanel } from "@/components/preview-panel";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, FieldMapping } from "@shared/schema";

export default function Home() {
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

  const handleCSVUpload = (data: any[], headers: string[]) => {
    setCSVData(data);
    setCSVHeaders(headers);
    
    // Auto-detect common field mappings
    const autoMapping: FieldMapping = {
      product: headers.find(h => h.toLowerCase().includes("product")) || "",
      sku: headers.find(h => h.toLowerCase().includes("sku")) || "",
      format: headers.find(h => h.toLowerCase().includes("format") || h.toLowerCase().includes("size")) || "",
      price: headers.find(h => h.toLowerCase().includes("price")) || "",
      category: headers.find(h => h.toLowerCase().includes("category") || h.toLowerCase().includes("producer") || h.toLowerCase().includes("winery")) || "",
      notes: headers.find(h => h.toLowerCase().includes("note")) || "",
    };
    
    setFieldMapping(autoMapping);
    setActiveTab("mapping");
  };

  const handleApplyMapping = () => {
    const mappedProducts: Product[] = csvData.map((row, index) => ({
      id: `product-${index}`,
      category: fieldMapping.category ? row[fieldMapping.category] || "" : "",
      notes: fieldMapping.notes ? row[fieldMapping.notes] || "" : "",
      product: row[fieldMapping.product] || "",
      sku: row[fieldMapping.sku] || "",
      format: row[fieldMapping.format] || "",
      price: row[fieldMapping.price] || "",
    }));

    setProducts(mappedProducts);
    setActiveTab("config");
  };

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
          </div>
        </div>
      </header>

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
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
