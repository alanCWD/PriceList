import { useRef, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, FileSpreadsheet } from "lucide-react";
import { PricelistDocument } from "@/components/pricelist-document";
import { generatePDF } from "@/lib/pdf-generator";
import { generateSpreadsheet, downloadSpreadsheet } from "@/lib/spreadsheet-generator";
import { useToast } from "@/hooks/use-toast";
import { parseCollection, extractWineTypeFromProductName, injectManualSortIndex, type BrandRegistryEntry } from "@/lib/collection-parser";
import { sortBrandGroups, type BrandOrderingEntry } from "@/lib/sort-utils";
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
  companyId?: number | null;
}

export function PreviewPanel({
  products,
  branding,
  salesAgents,
  qrCodeConfig,
  template = "pricelist",
  pricelistName,
  categoryFilter,
  brandRegistry,
  companyId,
}: PreviewPanelProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Fetch hidden SKUs from visibility table (authoritative source)
  // Pass companyId for Super Admin context
  // CRITICAL: Must wait for this to load before allowing PDF/Excel export
  const { data: hiddenSkus, isLoading: isLoadingVisibility } = useQuery<string[]>({
    queryKey: ['/api/visibility/hidden-skus', { companyId }],
    queryFn: async () => {
      const url = companyId 
        ? `/api/visibility/hidden-skus?companyId=${companyId}`
        : '/api/visibility/hidden-skus';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
  });

  // Create a Set of hidden SKUs for efficient lookup
  const hiddenSkusSet = useMemo(() => new Set(hiddenSkus || []), [hiddenSkus]);

  // Create a Set of valid SKUs from brand registry (only these products should appear)
  const registrySkusSet = useMemo(() => {
    if (!brandRegistry || brandRegistry.length === 0) return null;
    const skus = new Set<string>();
    for (const brand of brandRegistry) {
      if (brand.skus && Array.isArray(brand.skus)) {
        for (const sku of brand.skus) {
          if (sku) skus.add(sku);
        }
      }
    }
    return skus.size > 0 ? skus : null;
  }, [brandRegistry]);

  // Check if a product's SKU exists in the brand registry
  const isProductInRegistry = (product: Product): boolean => {
    // If no registry, allow all products (backwards compatibility)
    if (!registrySkusSet) return true;
    // Product must have a SKU that exists in the registry
    return !!(product.sku && registrySkusSet.has(product.sku));
  };

  // Check if a product is hidden using the authoritative visibility table
  const isProductHidden = (product: Product): boolean => {
    if (product.sku && hiddenSkusSet.has(product.sku)) {
      return true;
    }
    return product.isHidden || false;
  };

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
        // Pass product name to enable brand matching from product name when collection doesn't contain brand
        const parsed = parseCollection(collectionString, brandRegistryEntries, product.product);
        
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

  // Filter products: 
  // 1. Only include products whose SKU exists in brand registry
  // 2. Exclude hidden products (using visibility table)
  // 3. Exclude uncategorized
  // 4. Apply category filter if set
  const filteredProducts = normalizedProducts
    .filter((p) => isProductInRegistry(p)) // FIRST: Only products with SKUs in brand registry
    .filter((p) => !isProductHidden(p)) // Exclude hidden products using authoritative visibility table
    .filter((p) => !p.category || p.category.toLowerCase() !== "uncategorized") // Exclude uncategorized products
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
        brandRegistry, // Pass brandRegistry for manual product ordering
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

  const [isGeneratingSpreadsheet, setIsGeneratingSpreadsheet] = useState(false);

  const handleDownloadSpreadsheet = async () => {
    try {
      setIsGeneratingSpreadsheet(true);
      const blob = await generateSpreadsheet({
        products: filteredProducts,
        branding,
        pricelistName,
        brandRegistry,
        salesAgents,
      });
      
      const filename = pricelistName 
        ? `${pricelistName.replace(/[^a-z0-9]/gi, '_')}.xlsx`
        : 'pricelist.xlsx';
      
      downloadSpreadsheet(blob, filename);
      
      toast({
        title: "Spreadsheet Downloaded",
        description: "Your pricelist spreadsheet has been downloaded. Use the Status column dropdown to mark items.",
      });
    } catch (error) {
      console.error('Spreadsheet generation error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to generate spreadsheet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSpreadsheet(false);
    }
  };

  // Inject manualSortIndex from brand registry productOrder
  const productsWithSortIndex = useMemo(() => {
    if (!brandRegistry || brandRegistry.length === 0) {
      return filteredProducts;
    }
    return injectManualSortIndex(filteredProducts, brandRegistry);
  }, [filteredProducts, brandRegistry]);

  // Helper to extract brand from category - excludes regions and category words
  // Uses exact equality checks to avoid flagging brands like "Storied Wine Agency"
  const extractBrandFromCategory = (category: string): string => {
    if (!category) return "Uncategorized";
    
    // Check if it's a sortKey format (starts with digit-category-)
    const sortKeyMatch = category.match(/^\d+-\w+-(.+)$/);
    if (sortKeyMatch) {
      return sortKeyMatch[1]; // Return extracted brand name
    }
    
    // If it looks like raw collection data (contains semicolons), try to extract brand
    if (category.includes(';')) {
      const parts = category.split(';').map(p => p.trim()).filter(p => p);
      // Skip common single-word category/type/region terms (exact match only)
      const skipWords = ['wine', 'wines', 'cider', 'spirits', 'non alcoholic', 'non-alcoholic',
                         'white', 'red', 'rosé', 'rose', 'sparkling', 
                         'okanagan', 'vancouver island', 'similkameen', 'fraser valley',
                         'gulf islands', 'kootenays', 'bc', 'british columbia', 'lower mainland',
                         'riesling', 'chardonnay', 'pinot', 'merlot', 'cabernet'];
      for (const part of parts) {
        const lower = part.toLowerCase();
        // Only skip if it's an EXACT match - don't flag multi-word terms containing these words
        // This allows "Storied Wine Agency" and "Rust Wine Co" to pass through
        if (!skipWords.some(skip => lower === skip)) {
          return part; // This is likely the brand
        }
      }
      // All parts were skipped - no brand found
      return "Uncategorized";
    }
    
    // Check if the category itself is a region/category word (exact match only)
    const lower = category.toLowerCase().trim();
    const categoryWords = ['wine', 'wines', 'cider', 'spirits', 'non alcoholic', 'non-alcoholic',
                           'white', 'red', 'rosé', 'rose', 'sparkling', 
                           'okanagan', 'vancouver island', 'similkameen', 'fraser valley',
                           'gulf islands', 'kootenays', 'bc', 'british columbia', 'lower mainland'];
    if (categoryWords.some(word => lower === word)) {
      return "Uncategorized";
    }
    
    return category;
  };

  // Helper to extract brand from product name using brand registry
  // Mirrors the PDF generator's logic exactly
  const extractBrandFromProductName = (productName: string): string | null => {
    if (!productName) return null;
    
    const nameLower = productName.toLowerCase().trim();
    const productFirstWord = nameLower.split(/\s+/)[0];
    
    // If we have a brand registry, use it to find matching brands
    if (brandRegistry && brandRegistry.length > 0) {
      // Sort by brand name length (longest first) to match most specific brands
      const sortedBrands = [...brandRegistry].sort((a, b) => 
        (b.brandName?.length || 0) - (a.brandName?.length || 0)
      );
      
      for (const entry of sortedBrands) {
        if (!entry.brandName) continue;
        const brandLower = entry.brandName.toLowerCase().trim();
        
        // Strategy 1: Product name starts with brand
        if (nameLower.startsWith(brandLower)) {
          return entry.brandName;
        }
        
        // Strategy 2: Brand starts with product's first word
        if (productFirstWord.length >= 3 && brandLower.startsWith(productFirstWord)) {
          return entry.brandName;
        }
        
        // Strategy 3: Product's first word appears as a word in brand
        if (productFirstWord.length >= 3) {
          const escaped = productFirstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const wordBoundaryRegex = new RegExp(`(?:^|\\s|\\b)${escaped}[+]?(?:\\s|$|\\b)`, 'i');
          if (wordBoundaryRegex.test(brandLower)) {
            return entry.brandName;
          }
        }
      }
    }
    
    // Fallback: Extract first word as brand (for products without registry match)
    // Only if the first word looks like a brand name
    const skipWords = ['wine', 'wines', 'white', 'red', 'rosé', 'rose', 'sparkling', 
                       'cider', 'spirits', 'the', 'a', 'an', 'estate', 'winery'];
    const firstWord = productName.split(/\s+/)[0];
    if (firstWord && !skipWords.includes(firstWord.toLowerCase()) && firstWord.length >= 3) {
      // Check if it looks like a proper noun (first letter capitalized or number)
      if (/^[A-Z0-9]/.test(firstWord)) {
        return firstWord;
      }
    }
    
    return null;
  };

  // Get brand key for grouping - same logic as PDF generator
  const getBrandKey = (product: any): string => {
    // Skip words that should never be used as brand names (regions, categories, wine types)
    const skipWords = ['wine', 'wines', 'cider', 'spirits', 'non alcoholic', 'non-alcoholic',
                       'white', 'red', 'rosé', 'rose', 'sparkling', 
                       'okanagan', 'vancouver island', 'similkameen', 'fraser valley',
                       'gulf islands', 'kootenays', 'bc', 'british columbia', 'lower mainland'];
    
    // PRIORITY 1: Check if product name matches a brand in registry (highest priority)
    // This ensures "Rust Wines 2022 Merlot" matches "Rust Wines" brand even if collectionBrand says otherwise
    const registryMatch = extractBrandFromProductName(product.product);
    if (registryMatch && brandRegistry?.some(b => b.brandName === registryMatch)) {
      return registryMatch;
    }
    
    // PRIORITY 2: collectionBrand (if not a skip word)
    let brandKey = product.collectionBrand;
    
    // Check if collectionBrand is a skip word (region/category) - if so, don't use it
    if (brandKey && skipWords.includes(brandKey.toLowerCase().trim())) {
      brandKey = null;
    }
    
    // PRIORITY 3: extracted from category
    if (!brandKey) {
      brandKey = extractBrandFromCategory(product.category);
    }
    
    // PRIORITY 4: extracted from product name (fallback for non-registry brands)
    if (!brandKey || brandKey.toLowerCase() === "uncategorized") {
      if (registryMatch) {
        brandKey = registryMatch;
      } else {
        brandKey = "Uncategorized";
      }
    }
    return brandKey;
  };

  // Group products by brand (using improved brand extraction)
  const groupedProducts = productsWithSortIndex.reduce((acc, product) => {
    const brandKey = getBrandKey(product);
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

  // Convert brand registry to the format expected by sortBrandGroups
  const brandOrderingData: BrandOrderingEntry[] = useMemo(() => {
    if (!brandRegistry) return [];
    return brandRegistry.map(b => ({
      brandName: b.brandName,
      category: b.category as 'cider' | 'wine' | 'spirits' | 'nonAlc',
      displayOrder: b.displayOrder,
      productOrder: b.productOrder,
    }));
  }, [brandRegistry]);

  // Sort brand groups using shared utility with brand registry ordering
  // Ensures Wine → Spirits → Cider → NonAlc order, then by displayOrder, then alphabetical
  const orderedBrandGroups = sortBrandGroups(Object.entries(groupedProducts), brandOrderingData);

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <Card className="p-6 print:hidden">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Preview & Export</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Download as PDF, spreadsheet (with status tracking), or print directly
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={handlePrint}
              variant="outline"
              data-testid="button-print"
              className="gap-2"
              disabled={isLoadingVisibility}
            >
              <Printer className="w-4 h-4" />
              {isLoadingVisibility ? "Loading..." : "Print"}
            </Button>
            <Button
              onClick={handleDownloadSpreadsheet}
              variant="outline"
              data-testid="button-download-spreadsheet"
              className="gap-2"
              disabled={isGeneratingSpreadsheet || isLoadingVisibility}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isLoadingVisibility ? "Loading..." : isGeneratingSpreadsheet ? "Generating..." : "Download Spreadsheet"}
            </Button>
            <Button
              onClick={handleDownloadPDF}
              data-testid="button-download-pdf"
              className="gap-2"
              disabled={isLoadingVisibility}
            >
              <Download className="w-4 h-4" />
              {isLoadingVisibility ? "Loading visibility..." : "Download PDF"}
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
            brandOrdering={brandOrderingData}
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
