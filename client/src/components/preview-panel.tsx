import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { PricelistDocument } from "@/components/pricelist-document";
import { generatePDF } from "@/lib/pdf-generator";
import { useToast } from "@/hooks/use-toast";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, Template } from "@shared/schema";

interface PreviewPanelProps {
  products: Product[];
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  template?: Template;
  pricelistName?: string;
  categoryFilter?: string | null;
}

export function PreviewPanel({
  products,
  branding,
  salesAgents,
  qrCodeConfig,
  template = "modern",
  pricelistName,
  categoryFilter,
}: PreviewPanelProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Filter products by category if filter is set
  const filteredProducts = categoryFilter
    ? products.filter((p) => p.category === categoryFilter)
    : products;

  const handleDownloadPDF = async () => {
    try {
      await generatePDF({
        products: filteredProducts,
        branding,
        salesAgents,
        qrCodeConfig,
        template,
        pricelistName,
      });
      toast({
        title: "PDF Downloaded",
        description: "Your pricelist has been downloaded successfully.",
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Group filtered products by category
  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const category = product.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <Card className="p-6 print:hidden">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Preview & Export</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Review your pricelist and download as PDF or print directly
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handlePrint}
              variant="outline"
              data-testid="button-print"
              className="gap-2"
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button
              onClick={handleDownloadPDF}
              data-testid="button-download-pdf"
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </Card>

      {/* Document Preview */}
      <div className="bg-muted/30 p-8 print:p-0 print:bg-transparent">
        <div
          ref={documentRef}
          className="bg-white shadow-xl mx-auto print:shadow-none"
          style={{ maxWidth: "8.5in" }}
        >
          <PricelistDocument
            products={filteredProducts}
            groupedProducts={groupedProducts}
            branding={branding}
            salesAgents={salesAgents}
            qrCodeConfig={qrCodeConfig}
            template={template}
          />
        </div>
      </div>

      {/* Stats */}
      <Card className="p-6 print:hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <p className="text-2xl font-semibold text-foreground">{products.length}</p>
            <p className="text-sm text-muted-foreground">Total Products</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground">
              {Object.keys(groupedProducts).length}
            </p>
            <p className="text-sm text-muted-foreground">Categories</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground">{salesAgents.length}</p>
            <p className="text-sm text-muted-foreground">Sales Agents</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground">
              {qrCodeConfig ? "Yes" : "No"}
            </p>
            <p className="text-sm text-muted-foreground">QR Code</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
