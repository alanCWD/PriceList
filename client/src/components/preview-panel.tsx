import { useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { PricelistDocument } from "@/components/pricelist-document";
import { generatePDF } from "@/lib/pdf-generator";
import { useToast } from "@/hooks/use-toast";
import { parseCollection, type BrandRegistryEntry } from "@/lib/collection-parser";
import { sortBrandGroups } from "@/lib/sort-utils";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, Template, BrandRegistry } from "@shared/schema";

interface PreviewPanelProps {
  products: Product[];
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  template?: Template;
  pricelistName?: string;
  categoryFilter?: string | null;
  brandRegistry?: BrandRegistry[];
}

export function PreviewPanel({
  products,
  branding,
  salesAgents,
  qrCodeConfig,
  template = "modern",
  pricelistName,
  categoryFilter,
  brandRegistry,
}: PreviewPanelProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Normalize products: re-parse collection data for any product missing parsed fields
  const normalizedProducts = useMemo(() => {
    // Convert brand registry to the format expected by parseCollection
    const brandRegistryEntries: BrandRegistryEntry[] = (brandRegistry || []).map(b => ({
      brandName: b.brandName,
      category: b.category as 'cider' | 'wine' | 'spirits' | 'nonAlc',
      displayOrder: b.displayOrder,
    }));
    
    return products.map(product => {
      // If all parsed fields are present, use product as-is
      if (product.collectionBrand && product.collectionCategory) {
        return product;
      }
      
      // Re-parse collection data from collectionRaw or category
      const collectionString = product.collectionRaw || product.category || "";
      const parsed = parseCollection(collectionString, brandRegistryEntries);
      
      // If parsing failed, extract a clean brand name from the category string
      if (!parsed) {
        // Try to extract the first non-region, non-type term as the brand
        const terms = collectionString
          .split(';')
          .map(t => t.trim())
          .filter(t => t.length > 0);
        
        // Find first term that's not a region, wine type, or category
        const brandTerm = terms.find(t => {
          const lower = t.toLowerCase();
          return !lower.match(/okanagan|vancouver island|lower mainland|gulf islands|cider|wine|spirits|sparkling|white|ros[eé]|red|non alcoholic|keg/i);
        }) || terms[0] || "Uncategorized";
        
        return {
          ...product,
          collectionBrand: brandTerm,
        };
      }
      
      // Return product with parsed fields populated
      return {
        ...product,
        collectionBrand: parsed.brand,
        collectionCategory: parsed.primaryCategory,
        collectionType: parsed.wineType,
        collectionRegion: parsed.region,
      };
    });
  }, [products, brandRegistry]);

  // Filter products by category if filter is set, and exclude hidden products
  const filteredProducts = normalizedProducts
    .filter((p) => !p.isHidden) // Exclude hidden products
    .filter((p) => !categoryFilter || p.category === categoryFilter); // Apply category filter if set

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

  // Group filtered products by brand (collectionBrand) for single brand bars
  const groupedProducts = filteredProducts.reduce((acc, product) => {
    // Use collectionBrand as the key to group all products from same brand together
    const brandKey = product.collectionBrand || product.category || "Uncategorized";
    if (!acc[brandKey]) {
      acc[brandKey] = [];
    }
    acc[brandKey].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  // Sort products within each brand group by wine type (Sparkling → White → Rosé → Red)
  const wineTypeOrder: Record<string, number> = {
    'sparkling': 1,
    'white': 2,
    'rosé': 3,
    'rose': 3,
    'red': 4,
  };

  Object.entries(groupedProducts).forEach(([brandName, brandProducts]) => {
    // DEBUG: Log product types BEFORE sorting
    console.log(`[Preview] Brand "${brandName}" BEFORE sorting:`, 
      brandProducts.map(p => ({ 
        name: p.product, 
        type: p.collectionType,
        category: p.collectionCategory 
      }))
    );
    
    brandProducts.sort((a, b) => {
      // First sort by wine type
      const typeA = a.collectionType?.toLowerCase() || '';
      const typeB = b.collectionType?.toLowerCase() || '';
      const orderA = wineTypeOrder[typeA] || 999;
      const orderB = wineTypeOrder[typeB] || 999;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Then by product name as secondary sort
      return (a.product || '').localeCompare(b.product || '');
    });
    
    // DEBUG: Log product types AFTER sorting
    console.log(`[Preview] Brand "${brandName}" AFTER sorting:`, 
      brandProducts.map(p => ({ 
        name: p.product, 
        type: p.collectionType,
        order: wineTypeOrder[p.collectionType?.toLowerCase() || ''] || 999
      }))
    );
  });

  // Sort brand groups using shared utility
  // Ensures Wine → Spirits → Cider → NonAlc order with alphabetical brands within each category
  const orderedBrandGroups = sortBrandGroups(Object.entries(groupedProducts));

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
            groupedProducts={orderedBrandGroups}
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
            <p className="text-sm text-muted-foreground">Brands</p>
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
