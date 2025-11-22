import { useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { PricelistDocument } from "@/components/pricelist-document";
import { generatePDF } from "@/lib/pdf-generator";
import { useToast } from "@/hooks/use-toast";
import { parseCollection, extractWineTypeFromProductName, injectManualSortIndex, type BrandRegistryEntry } from "@/lib/collection-parser";
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
      // Start with the existing product
      let normalized = { ...product };
      
      // PRIORITY 1: For nonAlc products, ALWAYS extract wine type from product name first
      // (CSV collection strings often have incorrect wine types for non-alcoholic wines)
      if (normalized.collectionCategory === 'nonAlc' && !normalized.collectionType) {
        const extractedType = extractWineTypeFromProductName(product.product || '');
        if (extractedType) {
          normalized.collectionType = extractedType;
        }
      }
      
      // PRIORITY 2: Re-parse if ANY key field is still missing (brand, category, OR type)
      if (!product.collectionBrand || !product.collectionCategory || !product.collectionType) {
        const collectionString = product.collectionRaw || product.category || "";
        const parsed = parseCollection(collectionString, brandRegistryEntries);
        
        if (parsed) {
          // Apply parsed fields (only if not already present)
          normalized.collectionBrand = normalized.collectionBrand || parsed.brand;
          normalized.collectionCategory = normalized.collectionCategory || parsed.primaryCategory;
          // For nonAlc, skip wine type from collection (product name is more accurate)
          if (normalized.collectionCategory !== 'nonAlc') {
            normalized.collectionType = normalized.collectionType || parsed.wineType;
          }
          normalized.collectionRegion = normalized.collectionRegion || parsed.region;
        } else if (!product.collectionBrand) {
          // Parsing failed - extract a clean brand name from the category string
          const terms = collectionString
            .split(';')
            .map(t => t.trim())
            .filter(t => t.length > 0);
          
          // Find first term that's not a region, wine type, or category
          const brandTerm = terms.find(t => {
            const lower = t.toLowerCase();
            return !lower.match(/okanagan|vancouver island|lower mainland|gulf islands|cider|wine|spirits|sparkling|white|ros[eé]|red|non alcoholic|keg/i);
          }) || terms[0] || "Uncategorized";
          
          normalized.collectionBrand = brandTerm;
        }
      }
      
      // FINAL FALLBACK: If collectionType is STILL missing for wine products,
      // extract it from product name
      if (!normalized.collectionType && normalized.collectionCategory === 'wine') {
        const extractedType = extractWineTypeFromProductName(product.product || '');
        if (extractedType) {
          normalized.collectionType = extractedType;
        }
      }
      
      return normalized;
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

  // Inject manualSortIndex from brand registry productOrder
  const productsWithSortIndex = useMemo(() => {
    if (!brandRegistry || brandRegistry.length === 0) {
      return filteredProducts;
    }
    return injectManualSortIndex(filteredProducts, brandRegistry);
  }, [filteredProducts, brandRegistry]);

  // Group products by brand (collectionBrand) for single brand bars
  const groupedProducts = productsWithSortIndex.reduce((acc, product) => {
    // Use collectionBrand as the key to group all products from same brand together
    const brandKey = product.collectionBrand || product.category || "Uncategorized";
    if (!acc[brandKey]) {
      acc[brandKey] = [];
    }
    acc[brandKey].push(product);
    return acc;
  }, {} as Record<string, any[]>);

  // Sort products within each brand group
  // Priority 1: Manual order (via brand registry productOrder)
  // Priority 2: Automatic wine type sorting (Sparkling → White → Rosé → Red)
  const wineTypeOrder: Record<string, number> = {
    'sparkling': 1,
    'white': 2,
    'rosé': 3,
    'rose': 3,
    'red': 4,
  };

  // Helper to extract secondary wine type from "Sparkling X" product names
  const getSecondaryWineType = (productName: string, primaryType: string): string => {
    if (primaryType !== 'sparkling') return primaryType;
    
    const lower = productName.toLowerCase();
    // Check for secondary types in order of priority
    if (lower.includes('white')) return 'white';
    if (lower.includes('rosé') || lower.includes('rose') || lower.includes('pink')) return 'rosé';
    if (lower.includes('red')) return 'red';
    
    return primaryType; // fallback to primary
  };

  Object.values(groupedProducts).forEach(brandProducts => {
    brandProducts.sort((a, b) => {
      // PRIORITY 1: Check for manual ordering first
      const hasManualA = typeof a.manualSortIndex === 'number';
      const hasManualB = typeof b.manualSortIndex === 'number';
      
      // Both have manual order - sort by manualSortIndex
      if (hasManualA && hasManualB) {
        return a.manualSortIndex - b.manualSortIndex;
      }
      
      // Only A has manual order - A comes first
      if (hasManualA && !hasManualB) return -1;
      
      // Only B has manual order - B comes first
      if (!hasManualA && hasManualB) return 1;
      
      // PRIORITY 2: Neither has manual order - fall back to automatic wine type sorting
      // Get primary wine types
      const typeA = a.collectionType?.toLowerCase() || '';
      const typeB = b.collectionType?.toLowerCase() || '';
      
      // For sparkling products, use secondary type from product name
      const effectiveTypeA = getSecondaryWineType(a.product || '', typeA);
      const effectiveTypeB = getSecondaryWineType(b.product || '', typeB);
      
      const orderA = wineTypeOrder[effectiveTypeA] || 999;
      const orderB = wineTypeOrder[effectiveTypeB] || 999;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Tertiary sort: prioritize sparkling variants over non-sparkling when effective type is the same
      if (typeA === 'sparkling' && typeB !== 'sparkling') return -1;
      if (typeA !== 'sparkling' && typeB === 'sparkling') return 1;
      
      // Finally by product name
      return (a.product || '').localeCompare(b.product || '');
    });
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
