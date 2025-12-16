import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getDisplayName, injectManualSortIndex, lookupBrandBySKU, registryHasSKUMappings, type BrandWithOrder, type BrandRegistryEntry } from "./collection-parser";
import { sortBrandGroups, type BrandOrderingEntry } from "./sort-utils";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, Template, BrandRegistry } from "@shared/schema";

// Helper function to format price with 2 decimal places
function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price; // Return as-is if not a number
  return num.toFixed(2);
}

// Helper function to format footer text with brand name truncation
function formatFooterText(
  pageNum: number,
  companyName: string,
  date: string,
  brandName?: string,
  maxBrandLength: number = 30
): string {
  if (!brandName) {
    return `Page: ${pageNum} | ${companyName} Pricelist - ${date}`;
  }
  
  // Truncate brand name if too long to prevent overflow
  const truncatedBrand = brandName.length > maxBrandLength 
    ? brandName.substring(0, maxBrandLength - 3) + '...'
    : brandName;
  
  return `Page: ${pageNum} | ${companyName} - ${truncatedBrand} - ${date}`;
}

interface PDFConfig {
  products: Product[];
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  template?: Template;
  pricelistName?: string;
  brandName?: string; // For single-brand downloads
  brandRegistry?: BrandRegistry[]; // For manual product ordering
}

// Helper to convert BrandRegistry to BrandOrderingEntry for sorting
function toBrandOrderingEntries(brandRegistry?: BrandRegistry[]): BrandOrderingEntry[] {
  if (!brandRegistry) return [];
  return brandRegistry.map(b => ({
    brandName: b.brandName,
    category: b.category as 'cider' | 'wine' | 'spirits' | 'nonAlc',
    displayOrder: b.displayOrder,
    productOrder: b.productOrder,
  }));
}

// Helper to extract image format from data URL
const getImageFormat = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/);
  if (match) {
    const format = match[1].toUpperCase();
    // Map common formats to jsPDF-supported formats
    if (format === 'JPEG' || format === 'JPG') return 'JPEG';
    if (format === 'PNG') return 'PNG';
    if (format === 'WEBP') return 'WEBP';
  }
  return 'PNG'; // Default fallback
};

// Helper to extract brand name from category sortKey format or raw collection string
// sortKey format: "1-wine-BrandName" or "1-cider-BrandName"
// raw format: "Wine; Okanagan; BrandName; White"
// Uses exact equality checks to avoid flagging brands like "Storied Wine Agency"
function extractBrandFromCategory(category: string): string {
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
    // All parts were skipped - no brand found in this collection
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
  
  return category; // Fallback to original (might be a valid brand name)
}

// Helper to extract brand from product name using brand registry
// Uses multiple matching strategies for flexible brand detection
function extractBrandFromProductName(productName: string, brandRegistry?: any[]): string | null {
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
      
      // Strategy 1: Product name starts with brand (exact)
      // e.g., product "Synchromesh 2022 Riesling" starts with "synchromesh"
      if (nameLower.startsWith(brandLower)) {
        return entry.brandName;
      }
      
      // Strategy 2: Brand starts with product's first word
      // e.g., registry "Ones+ Non-Alc BC Wine" starts with product first word "ones"
      if (productFirstWord.length >= 3 && brandLower.startsWith(productFirstWord)) {
        return entry.brandName;
      }
      
      // Strategy 3: Product's first word appears as a distinct word in brand
      // e.g., registry "Storied Wine Agency Presents Ones+" contains "ones"
      // Match at word boundary or end of string (for "ones+" style brands)
      if (productFirstWord.length >= 3) {
        // Escape special regex chars in the first word, then look for word boundary or end
        const escaped = productFirstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match: word boundary + firstWord + optional special chars (like +) + (word boundary OR end)
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
}

// Build SKU→Brand map from brand registry for fast lookup
function buildSkuToBrandMap(brandRegistry?: any[]): Map<string, string> {
  const map = new Map<string, string>();
  if (brandRegistry) {
    brandRegistry.forEach((brand: any) => {
      if (brand.skus && Array.isArray(brand.skus)) {
        brand.skus.forEach((sku: string) => {
          map.set(sku, brand.brandName);
        });
      }
    });
  }
  return map;
}

// Build lowercase brand name→proper brand name map for fast lookup
function buildBrandNameMap(brandRegistry?: any[]): Map<string, string> {
  const map = new Map<string, string>();
  if (brandRegistry) {
    brandRegistry.forEach((brand: any) => {
      if (brand.brandName) {
        map.set(brand.brandName.toLowerCase(), brand.brandName);
      }
    });
  }
  return map;
}

// Cached maps (rebuilt when brandRegistry changes)
let cachedBrandRegistry: any[] | undefined;
let cachedSkuToBrandMap: Map<string, string> = new Map();
let cachedBrandNameMap: Map<string, string> = new Map();

// Helper to get the brand key for grouping products
// Uses SKU-only matching from brand registry - products must have SKU in registry
function getBrandKey(product: any, brandRegistry?: any[]): string | null {
  // Rebuild cache if brandRegistry changed
  if (brandRegistry !== cachedBrandRegistry) {
    cachedBrandRegistry = brandRegistry;
    cachedSkuToBrandMap = buildSkuToBrandMap(brandRegistry);
    cachedBrandNameMap = buildBrandNameMap(brandRegistry);
  }
  
  // SKU-only matching: product must have SKU that exists in brand registry
  if (product.sku && cachedSkuToBrandMap.has(product.sku)) {
    return cachedSkuToBrandMap.get(product.sku)!;
  }
  
  // No match - product won't be included in any brand group
  return null;
}

export async function generatePDF(config: PDFConfig): Promise<void> {
  const { products, branding, salesAgents, qrCodeConfig, template = "modern", pricelistName, brandName } = config;
  
  if (template === "classic") {
    return await generateClassicPDF(config);
  } else if (template === "minimal") {
    return await generateMinimalPDF(config);
  }
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const footerHeight = 40;
  let yPosition = margin;

  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const displayName = pricelistName || "Pricelist";

  // Convert QR code to base64 if present (minimal size for footer)
  let qrCodeBase64: string | null = null;
  const qrCodeSize = 20; // Minimal size for PDF footer
  if (qrCodeConfig?.url) {
    try {
      const QRCode = (await import('qrcode')).default;
      qrCodeBase64 = await QRCode.toDataURL(qrCodeConfig.url, { 
        width: qrCodeSize * 4, // Generate at higher resolution for clarity
        margin: 0 
      });
    } catch (error) {
      console.error('Failed to generate QR code for PDF:', error);
    }
  }

  // Load logo image if present
  let logoBase64: string | null = null;
  let logoFormat: string = 'PNG';
  const maxLogoHeight = 120;
  let logoWidth = 0;
  let logoHeight = 0;
  
  if (branding.logoUrl) {
    try {
      // Fetch and convert logo to base64
      const response = await fetch(branding.logoUrl);
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Detect image format from data URL
      logoFormat = getImageFormat(logoBase64);
      
      // Get logo dimensions to calculate aspect ratio
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = logoBase64!;
      });
      
      // Calculate logo dimensions maintaining aspect ratio
      const aspectRatio = img.width / img.height;
      logoHeight = Math.min(img.height, maxLogoHeight);
      logoWidth = logoHeight * aspectRatio;
      
      // Scale down logo width if it exceeds gutter (Modern template uses 180pt gutter)
      const maxLogoGutterWidth = 180;
      if (logoWidth > maxLogoGutterWidth) {
        logoWidth = maxLogoGutterWidth;
        logoHeight = logoWidth / aspectRatio;
      }
    } catch (error) {
      console.error('Failed to load logo for PDF:', error);
      logoBase64 = null;
    }
  }

  // Use extracted colors if available
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  const textColor = branding.headerTextColor 
    ? (hexToRgb(branding.headerTextColor) || { r: 30, g: 30, b: 30 })
    : { r: 30, g: 30, b: 30 };
  
  const bgColor = branding.headerBackgroundColor 
    ? hexToRgb(branding.headerBackgroundColor)
    : null;

  // Header height with minimum to ensure space for sales agents
  const minHeaderHeight = 70;
  const headerHeight = logoBase64 ? Math.max(logoHeight, minHeaderHeight) : minHeaderHeight;
  
  // Function to draw header on every page
  const drawHeader = () => {
    // Draw header background full-width band
    if (bgColor) {
      doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
      doc.rect(0, 0, pageWidth, headerHeight, "F");
    }

    // Minimal padding from edges
    const headerPadding = 10;
    const bottomPadding = 10;
    const lineHeight = 10;
    
    // Draw logo on the left if present with minimal left padding
    if (logoBase64) {
      try {
        // Center logo vertically if header is taller than logo
        const logoY = (headerHeight - logoHeight) / 2;
        doc.addImage(logoBase64, logoFormat, headerPadding, logoY, logoWidth, logoHeight);
      } catch (error) {
        console.error('Failed to add logo to PDF:', error);
        // Continue without logo
      }
    }

    // Calculate agent block height to position title/tagline above it
    let maxAgentLines = 0;
    if (salesAgents.length > 0) {
      salesAgents.forEach(agent => {
        let lineCount = 0;
        if (agent.region) lineCount++;
        lineCount += 3; // name, email, phone
        maxAgentLines = Math.max(maxAgentLines, lineCount);
      });
    }
    const agentBlockHeight = maxAgentLines * lineHeight;
    const agentTop = headerHeight - bottomPadding - agentBlockHeight;
    
    // Position title/tagline - move 0.5 inches (36pt) to the left from gutter edge
    const logoGutter = 180;
    const leftOffset = 36;
    const titleX = logoBase64 ? (headerPadding + logoGutter - leftOffset) : headerPadding;
    
    // Vertically center the title/tagline block within header
    const titleFontSize = 22;
    const taglineFontSize = 11;
    const lineSpacing = 4; // Space between title and tagline
    
    // Calculate total block height (font sizes approximate line heights)
    const titleHeight = titleFontSize * 0.8; // Approximate ascent
    const taglineHeight = branding.tagline ? taglineFontSize * 0.8 : 0;
    const blockHeight = titleHeight + (branding.tagline ? lineSpacing + taglineHeight : 0);
    
    // Center the block vertically
    const topPadding = (headerHeight - blockHeight) / 2;
    const titleBaseline = topPadding + titleHeight;
    const taglineBaseline = titleBaseline + lineSpacing + taglineHeight;
    
    // Title left-aligned
    doc.setFontSize(titleFontSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(branding.companyName, titleX, titleBaseline, { align: "left" });

    // Tagline left-aligned below title
    if (branding.tagline) {
      doc.setFontSize(taglineFontSize);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(branding.tagline, titleX, taglineBaseline, { align: "left" });
    }

    // Sales agents at bottom-right with right alignment
    if (salesAgents.length > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      
      const agentRightX = pageWidth - headerPadding;
      let agentSpacing = 30; // Space between agent columns (default)
      
      // Position agents from right to left
      let cumulativeOffset = 0;
      salesAgents.slice().reverse().forEach((agent) => {
        const lines = [];
        if (agent.region) lines.push(agent.region);
        lines.push(agent.name, agent.email, agent.phone);
        
        // Calculate width for this agent
        const agentWidth = Math.max(...lines.map(line => doc.getTextWidth(line)));
        
        // Calculate starting Y for this agent block (bottom-aligned)
        let agentY = headerHeight - bottomPadding - (lines.length - 1) * lineHeight;
        
        // Position this agent using cumulative offset
        const agentX = agentRightX - cumulativeOffset;
        
        // Draw agent info right-aligned
        lines.forEach(line => {
          doc.text(line, agentX, agentY, { align: "right" });
          agentY += lineHeight;
        });
        
        // Add this agent's width + spacing to cumulative offset for next agent
        cumulativeOffset += agentWidth + agentSpacing;
      });
    }
  };

  // Draw header on first page
  drawHeader();
  
  // Move yPosition to after header (add small spacing)
  yPosition = headerHeight + 20;

  // STEP 1: Normalize products with SKU-based brand lookup from Brand Registry
  // This ensures collectionBrand is set correctly for manual ordering to work
  const normalizedProducts = (() => {
    if (!config.brandRegistry || config.brandRegistry.length === 0) {
      return products;
    }
    
    // Convert to BrandRegistryEntry format with skus
    const brandRegistryEntries: BrandRegistryEntry[] = config.brandRegistry.map(b => ({
      brandName: b.brandName,
      category: b.category as 'cider' | 'wine' | 'spirits' | 'nonAlc',
      displayOrder: b.displayOrder,
      skus: b.skus || [],
    }));
    
    const hasSKUMappings = registryHasSKUMappings(brandRegistryEntries);
    if (!hasSKUMappings) {
      return products;
    }
    
    return products.map(product => {
      if (!product.sku) return product;
      
      const skuMatch = lookupBrandBySKU(product.sku, brandRegistryEntries);
      if (skuMatch) {
        return {
          ...product,
          collectionBrand: skuMatch.brandName,
          collectionCategory: product.collectionCategory || skuMatch.category,
        };
      }
      return product;
    });
  })();
  
  // STEP 2: Inject manual sort index from brand registry
  const productsWithSortIndex = config.brandRegistry && config.brandRegistry.length > 0
    ? injectManualSortIndex(normalizedProducts, config.brandRegistry)
    : normalizedProducts;
  
  // THEN filter out uncategorized products
  const filteredProducts = productsWithSortIndex.filter(product => {
    return !product.category || product.category.toLowerCase() !== "uncategorized";
  });

  // Group products by brand using SKU-only matching from brand registry
  // Products only appear if their SKU exists in the registry
  const groupedProducts = filteredProducts
    .reduce((acc, product) => {
      const brandKey = getBrandKey(product, config.brandRegistry);
      // Skip products without matching SKU in brand registry
      if (!brandKey) return acc;
      
      if (!acc[brandKey]) {
        acc[brandKey] = [];
      }
      acc[brandKey].push(product);
      return acc;
    }, {} as Record<string, any[]>);

  // Sort products within each brand
  // Priority 1: Manual order (via brand registry productOrder)
  // Priority 2: Automatic wine type sorting (Sparkling → White → Rosé → Red)
  const wineTypeOrder: Record<string, number> = {
    'sparkling': 1,
    'white': 2,
    'rose': 3,
    'rosé': 3,
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

  // Render products by brand (sorted using brand registry ordering)
  const brandOrderingData = toBrandOrderingEntries(config.brandRegistry);
  
  // Constants for page break calculations
  const brandHeaderHeight = 24; // Height of brand header bar
  const brandHeaderGap = 6; // Gap after brand header
  const tableHeaderHeight = 20; // Approximate height of table header row
  const minProductRowHeight = 15; // Minimum height for one product row
  const footerBufferSpace = 35; // Buffer space above footer area
  const simpleHeaderHeight = 30; // Height of simplified header on subsequent pages
  
  // Minimum space needed: brand bar + gap + table header + one product row + footer buffer
  const minBrandSectionSpace = brandHeaderHeight + brandHeaderGap + tableHeaderHeight + minProductRowHeight + footerBufferSpace;
  
  // Calculate where the footer area begins (content must end before this)
  const footerStartY = pageHeight - margin - footerHeight;
  
  sortBrandGroups(Object.entries(groupedProducts), brandOrderingData)
    .forEach(([groupBrandName, categoryProducts], index) => {
    if (index > 0) {
      yPosition += 20;
    }

    // Check if there's enough space for brand header + at least one product row
    // If not, add a new page before drawing the brand header
    const availableSpace = footerStartY - yPosition;
    if (availableSpace < minBrandSectionSpace) {
      doc.addPage();
      // Reset yPosition for new page (after simplified header)
      yPosition = simpleHeaderHeight + 20;
    }

    // Brand header - use same color as main header
    if (bgColor) {
      doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    } else {
      doc.setFillColor(30, 30, 30); // Fallback to dark gray
    }
    doc.rect(margin, yPosition, pageWidth - margin * 2, 24, "F");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(groupBrandName, margin + 12, yPosition + 16);
    yPosition += 30;

    // Capture the current categoryProducts for this table (avoid closure issues)
    const currentCategoryProducts = [...categoryProducts];

    // Products table - 5 columns: Notes, Product, SKU, Format, Price (no image column)
    const tableData = currentCategoryProducts.map(product => {
      return [
        product.notes || "",
        product.product,
        product.sku,
        product.format,
        formatPrice(product.price)
      ];
    });

    autoTable(doc, {
      startY: yPosition,
      head: [["Notes/Order", "Product", "SKU", "Format", "Price"]],
      body: tableData,
      theme: "plain",
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontSize: 9,
        fontStyle: "bold",
        halign: "left",
      },
      bodyStyles: {
        fontSize: 10,
        textColor: [30, 30, 30],
        minCellHeight: 15,
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: {
        0: { cellWidth: 80 },  // Notes
        1: { cellWidth: 181 }, // Product
        2: { cellWidth: 80 },  // SKU
        3: { cellWidth: 100 }, // Format
        4: { cellWidth: 75, halign: "right" },  // Price - right-aligned
        // Total: 80 + 181 + 80 + 100 + 75 = 516pt (full available width)
      },
      margin: { left: margin, right: margin, top: 50, bottom: margin + footerHeight },
      didDrawPage: (data) => {
        const currentPage = (doc as any).getCurrentPageInfo().pageNumber;
        
        // Draw full header only on first page
        if (currentPage === 1) {
          drawHeader();
        } else {
          // On subsequent pages, draw a simple centered title bar
          const simpleHeaderHeight = 30;
          
          // Draw background bar if color is defined
          if (bgColor) {
            doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
            doc.rect(0, 0, pageWidth, simpleHeaderHeight, "F");
          }
          
          // Center company name in the bar
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(textColor.r, textColor.g, textColor.b);
          const centerX = pageWidth / 2;
          doc.text(branding.companyName, centerX, simpleHeaderHeight / 2 + 5, { align: "center" });
        }
        
        // Minimal footer with text and small QR code
        const footerY = pageHeight - margin - 12;
        
        // Thin separator line
        const separatorY = footerY - 10;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, separatorY, pageWidth - margin, separatorY);
        
        // Footer text - include brand name for single-brand downloads
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        const footerText = formatFooterText(pageNum, branding.companyName, dayMonthDate, brandName, 30);
        doc.text(footerText, margin, footerY);
        
        // QR code on the right side, just below the separator line
        if (qrCodeBase64) {
          try {
            const qrX = pageWidth - margin - qrCodeSize;
            const qrY = separatorY + 2; // Position just below the separator line
            doc.addImage(qrCodeBase64, 'PNG', qrX, qrY, qrCodeSize, qrCodeSize);
          } catch (error) {
            console.error('Failed to add QR code to PDF:', error);
            // Continue without QR code
          }
        }
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  });

  // Save the PDF with descriptive filename
  const dateStr = new Date().toISOString().split("T")[0];
  let fileName: string;
  
  // Use short form company name for filenames if available
  const companyNameForFile = (branding.companyNameShort || branding.companyName).replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  
  if (brandName) {
    // Single-brand download: CompanyName BrandName Date.pdf
    const cleanBrandName = brandName.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
    fileName = `${companyNameForFile} ${cleanBrandName} ${dateStr}.pdf`;
  } else {
    // Full pricelist: CompanyName Pricelist Date.pdf
    fileName = `${companyNameForFile} Pricelist ${dateStr}.pdf`;
  }
  
  doc.save(fileName);
}

async function generateClassicPDF(config: PDFConfig): Promise<void> {
  const { products, branding, salesAgents, pricelistName, brandName } = config;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const footerHeight = 30;
  let yPosition = margin;

  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const displayName = pricelistName || "Pricelist";

  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.setTextColor(30, 30, 30);
  const titleWidth = doc.getTextWidth(branding.companyName);
  doc.text(branding.companyName, (pageWidth - titleWidth) / 2, yPosition);
  yPosition += 25;

  if (branding.tagline) {
    doc.setFont("times", "italic");
    doc.setFontSize(16);
    doc.setTextColor(70, 70, 70);
    const taglineWidth = doc.getTextWidth(branding.tagline);
    doc.text(branding.tagline, (pageWidth - taglineWidth) / 2, yPosition);
    yPosition += 20;
  }

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const dateWidth = doc.getTextWidth(dayMonthDate);
  doc.text(dayMonthDate, (pageWidth - dateWidth) / 2, yPosition);
  yPosition += 20;

  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(1);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 30;

  // STEP 1: Normalize products with SKU-based brand lookup from Brand Registry
  // This ensures collectionBrand is set correctly for manual ordering to work
  const normalizedProducts = (() => {
    if (!config.brandRegistry || config.brandRegistry.length === 0) {
      return products;
    }
    
    // Convert to BrandRegistryEntry format with skus
    const brandRegistryEntries: BrandRegistryEntry[] = config.brandRegistry.map(b => ({
      brandName: b.brandName,
      category: b.category as 'cider' | 'wine' | 'spirits' | 'nonAlc',
      displayOrder: b.displayOrder,
      skus: b.skus || [],
    }));
    
    const hasSKUMappings = registryHasSKUMappings(brandRegistryEntries);
    if (!hasSKUMappings) {
      return products;
    }
    
    return products.map(product => {
      if (!product.sku) return product;
      
      const skuMatch = lookupBrandBySKU(product.sku, brandRegistryEntries);
      if (skuMatch) {
        return {
          ...product,
          collectionBrand: skuMatch.brandName,
          collectionCategory: product.collectionCategory || skuMatch.category,
        };
      }
      return product;
    });
  })();
  
  // STEP 2: Inject manual sort index from brand registry
  const productsWithSortIndex = config.brandRegistry && config.brandRegistry.length > 0
    ? injectManualSortIndex(normalizedProducts, config.brandRegistry)
    : normalizedProducts;
  
  // THEN filter out uncategorized products
  const filteredProducts = productsWithSortIndex.filter(product => {
    return !product.category || product.category.toLowerCase() !== "uncategorized";
  });

  // Group products by brand using SKU-only matching from brand registry
  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const brandKey = getBrandKey(product, config.brandRegistry);
    // Skip products without matching SKU in brand registry
    if (!brandKey) return acc;
    
    if (!acc[brandKey]) {
      acc[brandKey] = [];
    }
    acc[brandKey].push(product);
    return acc;
  }, {} as Record<string, any[]>);

  // Sort products within each brand
  // Priority 1: Manual order (via brand registry productOrder)
  // Priority 2: Automatic wine type sorting (Sparkling → White → Rosé → Red)
  const wineTypeOrder: Record<string, number> = {
    'sparkling': 1,
    'white': 2,
    'rose': 3,
    'rosé': 3,
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

  // Sort using brand registry ordering
  const brandOrderingData2 = toBrandOrderingEntries(config.brandRegistry);
  
  // Constants for page break calculations (Classic template)
  const brandHeaderHeight = 25; // Height of brand text + underline
  const tableHeaderHeight = 22; // Approximate height of table header row
  const minProductRowHeight = 16; // Minimum height for one product row
  const footerBufferSpace = 40; // Buffer space above footer area
  const simpleHeaderHeight = 35; // Height of simplified header on subsequent pages
  
  // Minimum space needed: brand bar + table header + one product row + footer buffer
  const minBrandSectionSpace = brandHeaderHeight + tableHeaderHeight + minProductRowHeight + footerBufferSpace;
  
  // Calculate where the footer area begins (content must end before this)
  const footerStartY = pageHeight - margin - footerHeight;
  
  sortBrandGroups(Object.entries(groupedProducts), brandOrderingData2)
    .forEach(([groupBrandName, categoryProducts], index) => {
    if (index > 0) {
      yPosition += 25;
    }

    // Check if there's enough space for brand header + at least one product row
    // If not, add a new page before drawing the brand header
    const availableSpace = footerStartY - yPosition;
    if (availableSpace < minBrandSectionSpace) {
      doc.addPage();
      // Reset yPosition for new page (after simplified header)
      yPosition = simpleHeaderHeight + 20;
    }

    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 30, 30);
    doc.text(groupBrandName, margin, yPosition);
    yPosition += 5;
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(2);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;

    const tableData = categoryProducts.map(product => [
      product.sku,
      product.product,
      product.format,
      formatPrice(product.price),
      product.notes || "",
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["SKU", "Product", "Format", "Price", "Notes"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [229, 231, 235],
        textColor: [30, 30, 30],
        fontSize: 10,
        fontStyle: "bold",
        halign: "left",
        font: "times",
      },
      bodyStyles: {
        fontSize: 10,
        textColor: [30, 30, 30],
        font: "times",
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 200 },
        2: { cellWidth: 100 },
        3: { cellWidth: 70, halign: "right" },
        4: { cellWidth: 100 },
      },
      margin: { left: margin, right: margin, bottom: margin + footerHeight },
      didDrawPage: (data) => {
        // Footer on every page
        const footerY = pageHeight - margin - 20;
        
        // Thin separator line
        doc.setDrawColor(156, 163, 175);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
        
        // Footer text - include brand name for single-brand downloads
        doc.setFontSize(10);
        doc.setFont("times", "normal");
        doc.setTextColor(100, 100, 100);
        
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        // Classic template uses spaces instead of "|" separators
        const footerText = formatFooterText(pageNum, branding.companyName, dayMonthDate, brandName, 30).replace(/\|/g, '   ');
        doc.text(footerText, margin, footerY);
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  });

  // Save the PDF with descriptive filename
  const dateStr = new Date().toISOString().split("T")[0];
  let fileName: string;
  
  // Use short form company name for filenames if available
  const companyNameForFile = (branding.companyNameShort || branding.companyName).replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  
  if (brandName) {
    // Single-brand download: CompanyName BrandName Date.pdf
    const cleanBrandName = brandName.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
    fileName = `${companyNameForFile} ${cleanBrandName} ${dateStr}.pdf`;
  } else {
    // Full pricelist: CompanyName Pricelist Date.pdf
    fileName = `${companyNameForFile} Pricelist ${dateStr}.pdf`;
  }
  
  doc.save(fileName);
}

async function generateMinimalPDF(config: PDFConfig): Promise<void> {
  const { products, branding, salesAgents, pricelistName, qrCodeConfig, brandName } = config;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40; // Reduced margin for more content
  const footerHeight = 25; // Reduced footer
  let yPosition = margin;

  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const displayName = pricelistName || "Pricelist";

  // Process logo if present
  let logoBase64 = null;
  let logoFormat = "PNG";
  let logoWidth = 0;
  let logoHeight = 0;
  
  if (branding.logoUrl) {
    try {
      const response = await fetch(branding.logoUrl);
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      logoFormat = getImageFormat(logoBase64);
      
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = logoBase64!;
      });
      
      const aspectRatio = img.width / img.height;
      logoHeight = 40; // Compact height for minimal template
      logoWidth = logoHeight * aspectRatio;
      
      // Scale down logo width if it exceeds gutter (Minimal template uses 140pt gutter)
      const maxLogoGutterWidth = 140;
      if (logoWidth > maxLogoGutterWidth) {
        logoWidth = maxLogoGutterWidth;
        logoHeight = logoWidth / aspectRatio;
      }
    } catch (error) {
      console.error('Failed to load logo:', error);
    }
  }

  // Process QR code if present
  let qrCodeBase64 = null;
  const qrCodeSize = 20; // Very small for minimal template
  
  if (qrCodeConfig?.url) {
    try {
      const QRCode = (await import('qrcode')).default;
      qrCodeBase64 = await QRCode.toDataURL(qrCodeConfig.url, {
        width: qrCodeSize * 4,
        margin: 1,
      });
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  }

  // Extract colors from branding
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  const textColor = branding.headerTextColor 
    ? (hexToRgb(branding.headerTextColor) || { r: 30, g: 30, b: 30 })
    : { r: 30, g: 30, b: 30 };
  
  const bgColor = branding.headerBackgroundColor 
    ? hexToRgb(branding.headerBackgroundColor)
    : null;

  // Compact header height with minimum to ensure space for sales agents
  const minHeaderHeight = 45;
  const headerHeight = logoBase64 ? Math.max(logoHeight + 10, minHeaderHeight) : minHeaderHeight;
  
  // Function to draw compact header (only on first page)
  const drawHeader = () => {
    // Draw header background
    if (bgColor) {
      doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
      doc.rect(0, 0, pageWidth, headerHeight, "F");
    }

    const headerPadding = 8;
    const lineHeight = 8;
    
    // Logo on left if present
    if (logoBase64) {
      try {
        const logoY = (headerHeight - logoHeight) / 2;
        doc.addImage(logoBase64, logoFormat, headerPadding, logoY, logoWidth, logoHeight);
      } catch (error) {
        console.error('Failed to add logo to PDF:', error);
      }
    }

    // Calculate agent block height
    let maxAgentLines = 0;
    if (salesAgents.length > 0) {
      salesAgents.forEach(agent => {
        let lineCount = 0;
        if (agent.region) lineCount++;
        lineCount += 3; // name, email, phone
        maxAgentLines = Math.max(maxAgentLines, lineCount);
      });
    }
    const agentBlockHeight = maxAgentLines * lineHeight;
    const agentTop = headerHeight - headerPadding - agentBlockHeight;
    
    // Position title/tagline - move 0.5 inches (36pt) to the left from gutter edge
    const logoGutter = 140;
    const leftOffset = 36;
    const titleX = logoBase64 ? (headerPadding + logoGutter - leftOffset) : headerPadding;
    
    // Vertically center the title/tagline block within header
    const titleFontSize = 16;
    const taglineFontSize = 9;
    const lineSpacing = 3; // Space between title and tagline
    
    // Calculate total block height (font sizes approximate line heights)
    const titleHeight = titleFontSize * 0.8; // Approximate ascent
    const taglineHeight = branding.tagline ? taglineFontSize * 0.8 : 0;
    const blockHeight = titleHeight + (branding.tagline ? lineSpacing + taglineHeight : 0);
    
    // Center the block vertically
    const topPadding = (headerHeight - blockHeight) / 2;
    const titleBaseline = topPadding + titleHeight;
    const taglineBaseline = titleBaseline + lineSpacing + taglineHeight;
    
    doc.setFontSize(titleFontSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(branding.companyName, titleX, titleBaseline, { align: "left" });

    if (branding.tagline) {
      doc.setFontSize(taglineFontSize);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(branding.tagline, titleX, taglineBaseline, { align: "left" });
    }

    // Sales agents at bottom-right
    if (salesAgents.length > 0) {
      doc.setFontSize(7); // Smaller font
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      
      const agentRightX = pageWidth - headerPadding;
      let agentSpacing = 20; // Space between agent columns (default)
      
      // Position agents from right to left
      let cumulativeOffset = 0;
      salesAgents.slice().reverse().forEach((agent) => {
        const lines = [];
        if (agent.region) lines.push(agent.region);
        lines.push(agent.name, agent.email, agent.phone);
        
        // Calculate width for this agent
        const agentWidth = Math.max(...lines.map(line => doc.getTextWidth(line)));
        
        let agentY = headerHeight - headerPadding - (lines.length - 1) * lineHeight;
        
        // Position this agent using cumulative offset
        const agentX = agentRightX - cumulativeOffset;
        
        lines.forEach(line => {
          doc.text(line, agentX, agentY, { align: "right" });
          agentY += lineHeight;
        });
        
        // Add this agent's width + spacing to cumulative offset for next agent
        cumulativeOffset += agentWidth + agentSpacing;
      });
    }
  };

  // Draw header on first page only
  drawHeader();
  yPosition = headerHeight + 15;

  // STEP 1: Normalize products with SKU-based brand lookup from Brand Registry
  // This ensures collectionBrand is set correctly for manual ordering to work
  const normalizedProducts = (() => {
    if (!config.brandRegistry || config.brandRegistry.length === 0) {
      return products;
    }
    
    // Convert to BrandRegistryEntry format with skus
    const brandRegistryEntries: BrandRegistryEntry[] = config.brandRegistry.map(b => ({
      brandName: b.brandName,
      category: b.category as 'cider' | 'wine' | 'spirits' | 'nonAlc',
      displayOrder: b.displayOrder,
      skus: b.skus || [],
    }));
    
    const hasSKUMappings = registryHasSKUMappings(brandRegistryEntries);
    if (!hasSKUMappings) {
      return products;
    }
    
    return products.map(product => {
      if (!product.sku) return product;
      
      const skuMatch = lookupBrandBySKU(product.sku, brandRegistryEntries);
      if (skuMatch) {
        return {
          ...product,
          collectionBrand: skuMatch.brandName,
          collectionCategory: product.collectionCategory || skuMatch.category,
        };
      }
      return product;
    });
  })();
  
  // STEP 2: Inject manual sort index from brand registry
  const productsWithSortIndex = config.brandRegistry && config.brandRegistry.length > 0
    ? injectManualSortIndex(normalizedProducts, config.brandRegistry)
    : normalizedProducts;
  
  // THEN filter out uncategorized products
  const filteredProducts = productsWithSortIndex.filter(product => {
    return !product.category || product.category.toLowerCase() !== "uncategorized";
  });

  // Group products by brand using SKU-only matching from brand registry
  // Products only appear if their SKU exists in the registry
  const groupedProducts = filteredProducts
    .reduce((acc, product) => {
      const brandKey = getBrandKey(product, config.brandRegistry);
      // Skip products without matching SKU in brand registry
      if (!brandKey) return acc;
      
      if (!acc[brandKey]) {
        acc[brandKey] = [];
      }
      acc[brandKey].push(product);
      return acc;
    }, {} as Record<string, any[]>);

  // Sort products within each brand
  // Priority 1: Manual order (via brand registry productOrder)
  // Priority 2: Automatic wine type sorting (Sparkling → White → Rosé → Red)
  const wineTypeOrder: Record<string, number> = {
    'sparkling': 1,
    'white': 2,
    'rose': 3,
    'rosé': 3,
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

  // Render products by brand (sorted using brand registry ordering)
  const brandOrderingData3 = toBrandOrderingEntries(config.brandRegistry);
  
  // Constants for page break calculations (Minimal template - uses smaller spacing)
  const brandHeaderHeightMin = 18; // Height of brand header bar (minimal)
  const brandHeaderGapMin = 4; // Gap after brand header
  const tableHeaderHeightMin = 10; // Approximate height of table header row (smaller fonts)
  const minProductRowHeightMin = 8; // Minimum height for one product row (compact)
  const footerBufferSpaceMin = 30; // Buffer space above footer area
  const simpleHeaderHeightMin = 25; // Height of simplified header on subsequent pages
  
  // Minimum space needed: brand bar + gap + table header + one product row + footer buffer
  const minBrandSectionSpaceMin = brandHeaderHeightMin + brandHeaderGapMin + tableHeaderHeightMin + minProductRowHeightMin + footerBufferSpaceMin;
  
  // Calculate where the footer area begins (content must end before this)
  const footerStartYMin = pageHeight - margin - footerHeight;
  
  sortBrandGroups(Object.entries(groupedProducts), brandOrderingData3)
    .forEach(([groupBrandName, categoryProducts], index) => {
    if (index > 0) {
      yPosition += 12; // Minimal spacing between categories
    }

    // Check if there's enough space for brand header + at least one product row
    // If not, add a new page before drawing the brand header
    const availableSpace = footerStartYMin - yPosition;
    if (availableSpace < minBrandSectionSpaceMin) {
      doc.addPage();
      // Reset yPosition for new page (after simplified header)
      yPosition = simpleHeaderHeightMin + 15;
    }

    // Brand header - matches header background colour with grey text
    // groupBrandName is already the clean brand name (e.g., "Mt. Boucherie Estate Winery")
    const displayName = groupBrandName;
    
    if (bgColor) {
      doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    } else {
      doc.setFillColor(248, 249, 250); // Default light grey if no header colour
    }
    doc.rect(margin, yPosition, pageWidth - margin * 2, 18, "F"); // Smaller header
    doc.setTextColor(216, 219, 217); // Grey text (#D8DBD9)
    doc.setFontSize(11); // Smaller brand font
    doc.setFont("helvetica", "bold");
    doc.text(displayName, margin + 8, yPosition + 12);
    yPosition += 22;

    const currentCategoryProducts = [...categoryProducts];

    // Products table with compressed spacing - column order: SKU, Product, Format, Price, Ribbon, Notes
    // Ribbon is 2nd-to-last column (blank header), Notes is last column
    
    // Debug: Log products with ribbon and notes data
    const productsWithRibbon = currentCategoryProducts.filter(p => p.ribbon && p.ribbon.trim() !== "");
    const productsWithNotes = currentCategoryProducts.filter(p => p.notes && p.notes.trim() !== "");
    console.log(`[MinimalPDF] Brand "${groupBrandName}": ${currentCategoryProducts.length} products, ${productsWithRibbon.length} with ribbon, ${productsWithNotes.length} with notes`);
    if (productsWithRibbon.length > 0 || productsWithNotes.length > 0) {
      console.log(`[MinimalPDF] Sample data:`, currentCategoryProducts.slice(0, 3).map(p => ({ sku: p.sku, ribbon: p.ribbon, notes: p.notes })));
    }
    
    const tableData = currentCategoryProducts.map(product => {
      const ribbon = (product.ribbon || "").trim();
      const notes = (product.notes || "").trim();
      
      return [
        product.sku,
        product.product,
        product.format,
        formatPrice(product.price),
        ribbon,  // 2nd-to-last column (blank header)
        notes    // Last column
      ];
    });

    // Build header row - Ribbon has blank header, Notes has "Notes" header
    const headRow = ["SKU", "Product", "Format", "Price", "", "Notes"];

    autoTable(doc, {
      startY: yPosition,
      head: [headRow],
      body: tableData,
      theme: "plain",
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontSize: 6.5, // Ultra-small header font (1/4 reduction)
        fontStyle: "bold",
        halign: "left",
        cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 }, // Minimum padding
        minCellHeight: 5, // Minimal header row height
      },
      bodyStyles: {
        fontSize: 6.5, // Ultra-small body font (1/4 reduction)
        textColor: [30, 30, 30],
        minCellHeight: 5, // Ultra-compact rows
        cellPadding: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 }, // Minimum padding
      },
      alternateRowStyles: {
        fillColor: [242, 242, 242], // Stronger zebra striping for better visibility
      },
      columnStyles: {
        // Column order: SKU, Product, Format, Price, Ribbon (blank header), Notes
        // Available width: 612pt - 80pt margins = 532pt
        // Adjusted widths per user request: Product -0.5", Format -0.5", Price -1" (moved left)
        // New widths: 50 + 185 + 55 + 40 + 95 + 107 = 532pt
        0: { cellWidth: 50 },      // SKU
        1: { cellWidth: 185 },     // Product (moved left 0.5" = reduced by 35pt)
        2: { cellWidth: 55 },      // Format (moved left 0.5")
        3: { cellWidth: 40, halign: "left" },   // Price - left-aligned to stay under header
        4: { cellWidth: 95 },      // Ribbon (blank header, 2nd-to-last) - more space
        5: { cellWidth: 107 },     // Notes (last column) - more space
      },
      margin: { left: margin, right: margin, top: 35, bottom: margin + footerHeight },
      didDrawPage: (data) => {
        // Only draw header on first page
        const currentPageNum = (doc as any).getCurrentPageInfo().pageNumber;
        if (currentPageNum === 1) {
          drawHeader();
        }
        
        // Minimal footer
        const footerY = pageHeight - margin - 10;
        const separatorY = footerY - 8;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, separatorY, pageWidth - margin, separatorY);
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        // Minimal template uses smaller font, so use shorter max brand length
        const footerText = formatFooterText(pageNum, branding.companyName, dayMonthDate, brandName, 25);
        doc.text(footerText, margin, footerY);
        
        // Tiny QR code on the right with "Order Here:" label
        if (qrCodeBase64) {
          try {
            const qrX = pageWidth - margin - qrCodeSize;
            const qrY = separatorY + 1;
            
            // Add "Order Here:" text to the left of the QR code
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 100, 100);
            const labelText = "Order Here:";
            const labelWidth = doc.getTextWidth(labelText);
            const labelX = qrX - labelWidth - 3; // 3pt gap between text and QR code
            const labelY = qrY + (qrCodeSize / 2) + 2; // Vertically center with QR code
            doc.text(labelText, labelX, labelY);
            
            doc.addImage(qrCodeBase64, 'PNG', qrX, qrY, qrCodeSize, qrCodeSize);
          } catch (error) {
            console.error('Failed to add QR code to PDF:', error);
          }
        }
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 8;
  });

  // Save the PDF with descriptive filename
  const dateStr = new Date().toISOString().split("T")[0];
  let fileName: string;
  
  // Use short form company name for filenames if available
  const companyNameForFile = (branding.companyNameShort || branding.companyName).replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  
  if (brandName) {
    // Single-brand download: CompanyName BrandName Date.pdf
    const cleanBrandName = brandName.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
    fileName = `${companyNameForFile} ${cleanBrandName} ${dateStr}.pdf`;
  } else {
    // Full pricelist: CompanyName Pricelist Date.pdf
    fileName = `${companyNameForFile} Pricelist ${dateStr}.pdf`;
  }
  
  doc.save(fileName);
}
