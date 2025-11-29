/**
 * Parse Wix collection field to extract brand name and determine sort order
 * 
 * Collection format examples:
 * - "Wine; Okanagan; Synchromesh; White; Riesling"
 * - "Non Alcoholic; Okanagan; Ones+ Non-Alc BC Wine; Red; Wine"
 * - "Cider; Vancouver Island; Salt Spring Wild; Keg"
 * - "Spirits; Okanagan; Macaloney's; Whisky"
 * 
 * Terms can appear in variable order
 */

// Primary category identifiers
const CATEGORY_INDICATORS = {
  cider: ['cider'],
  wine: ['wine'],
  spirits: ['spirits', 'spirit', 'whisky', 'whiskey', 'gin', 'vodka'],
  nonAlc: ['non alcoholic', 'non-alcoholic', 'nonalcoholic'],
};

// Wine type identifiers for sub-sorting
const WINE_TYPES = {
  sparkling: ['sparkling', 'cuvée', 'cuvee', 'prosecco', 'champagne'],
  white: ['white', 'blanc', 'riesling', 'chardonnay', 'pinot gris', 'sauvignon blanc'],
  rosé: ['rosé', 'rose', 'pink', 'blush'],
  red: ['red', 'noir', 'merlot', 'cabernet', 'syrah', 'pinot noir'],
};

// Regions to recognize (not brand names, stored but not displayed)
const REGIONS = [
  'okanagan',
  'vancouver island',
  'similkameen',
  'fraser valley',
  'gulf islands',
  'kootenays',
  'bc',
  'british columbia',
  'lower mainland',
];

// Noise words to ignore
const NOISE_WORDS = ['keg', 'bottle', 'can'];

// Known wineries/brands to explicitly recognize
const KNOWN_WINERIES = [
  'cannon estate',
  'synchromesh',
  'salt spring wild',
  'cobble hill winery',
  'ones+ non-alc bc wine',
];

interface ParsedCollection {
  brand: string;
  primaryCategory: 'cider' | 'wine' | 'spirits' | 'nonAlc';
  wineType?: 'sparkling' | 'white' | 'rosé' | 'red';
  region?: string;
  sortKey: string; // e.g., "1-Cider-Salt Spring Wild" or "2-Wine-White-Synchromesh"
}

export interface BrandRegistryEntry {
  brandName: string;
  category: 'cider' | 'wine' | 'spirits' | 'nonAlc';
  displayOrder?: number | null;
}

/**
 * Parse collection string to extract brand and categorization
 * If brandRegistry is provided, brands will be looked up in the registry first
 * If productName is provided, it will also be checked against the registry
 */
export function parseCollection(
  collectionString: string, 
  brandRegistry?: BrandRegistryEntry[],
  productName?: string
): ParsedCollection | null {
  if (!collectionString) return null;

  // Split by semicolon and clean up terms
  const terms = collectionString
    .split(';')
    .map(term => term.trim())
    .filter(term => term.length > 0)
    .map(term => term.toLowerCase());
  
  const originalTerms = collectionString.split(';').map(t => t.trim()).filter(t => t.length > 0);

  // FIRST PRIORITY: Check brand registry if provided
  let registryMatch: { brand: string; category: 'cider' | 'wine' | 'spirits' | 'nonAlc' } | null = null;
  if (brandRegistry && brandRegistry.length > 0) {
    // Check 1: Try to match collection terms against registry (exact match)
    for (const term of originalTerms) {
      const matchedBrand = brandRegistry.find(
        b => b.brandName.toLowerCase() === term.toLowerCase()
      );
      if (matchedBrand) {
        registryMatch = {
          brand: matchedBrand.brandName, // Use registry's canonical name
          category: matchedBrand.category,
        };
        break;
      }
    }
    
    // Check 2: If no collection term matched, check product name against registry
    // This handles cases like "Ones Sparkling White" matching "Ones+ Non-Alc BC Wine"
    if (!registryMatch && productName) {
      const nameLower = productName.toLowerCase().trim();
      const productFirstWord = nameLower.split(/\s+/)[0];
      
      // Sort by brand name length (longest first) to match most specific brands
      const sortedBrands = [...brandRegistry].sort((a, b) => 
        (b.brandName?.length || 0) - (a.brandName?.length || 0)
      );
      
      for (const entry of sortedBrands) {
        if (!entry.brandName) continue;
        const brandLower = entry.brandName.toLowerCase().trim();
        
        // Strategy 1: Product name starts with brand (exact)
        // e.g., product "1 Mill Road 2024 Grenache" starts with "1 mill road"
        if (nameLower.startsWith(brandLower)) {
          registryMatch = {
            brand: entry.brandName,
            category: entry.category,
          };
          break;
        }
        
        // Strategy 2: Brand starts with product's first word
        // e.g., registry "Ones+ Non-Alc BC Wine" starts with product first word "ones"
        if (productFirstWord.length >= 3 && brandLower.startsWith(productFirstWord)) {
          registryMatch = {
            brand: entry.brandName,
            category: entry.category,
          };
          break;
        }
        
        // Strategy 3: Product's first word appears as a distinct word in brand
        // Match at word boundary or end of string (for "ones+" style brands)
        if (productFirstWord.length >= 3) {
          const escaped = productFirstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const wordBoundaryRegex = new RegExp(`(?:^|\\s|\\b)${escaped}[+]?(?:\\s|$|\\b)`, 'i');
          if (wordBoundaryRegex.test(brandLower)) {
            registryMatch = {
              brand: entry.brandName,
              category: entry.category,
            };
            break;
          }
        }
      }
    }
  }

  // If we found a match in the registry, use it for category
  let primaryCategory: 'cider' | 'wine' | 'spirits' | 'nonAlc' | null = registryMatch?.category || null;
  
  // If not found in registry, determine category from collection string
  if (!primaryCategory) {
    for (const term of terms) {
      if (CATEGORY_INDICATORS.cider.some(indicator => term.includes(indicator))) {
        primaryCategory = 'cider';
        break;
      }
      if (CATEGORY_INDICATORS.nonAlc.some(indicator => term.includes(indicator))) {
        primaryCategory = 'nonAlc';
        break;
      }
      if (CATEGORY_INDICATORS.spirits.some(indicator => term.includes(indicator))) {
        primaryCategory = 'spirits';
        break;
      }
      if (CATEGORY_INDICATORS.wine.some(indicator => term.includes(indicator))) {
        primaryCategory = 'wine';
        break;
      }
    }
  }

  if (!primaryCategory) return null;

  // Determine wine type if it's wine or nonAlc category
  let wineType: 'sparkling' | 'white' | 'rosé' | 'red' | undefined;
  if (primaryCategory === 'wine' || primaryCategory === 'nonAlc') {
    for (const term of terms) {
      if (WINE_TYPES.sparkling.some(indicator => term.includes(indicator))) {
        wineType = 'sparkling';
        break;
      }
      if (WINE_TYPES.white.some(indicator => term.includes(indicator))) {
        wineType = 'white';
        break;
      }
      if (WINE_TYPES.rosé.some(indicator => term.includes(indicator))) {
        wineType = 'rosé';
        break;
      }
      if (WINE_TYPES.red.some(indicator => term.includes(indicator))) {
        wineType = 'red';
        break;
      }
    }
  }

  // Extract brand name and region
  // If we matched a brand in the registry, use it; otherwise extract from collection
  let brand = registryMatch?.brand || '';
  let region: string | undefined;
  
  // If brand not from registry, extract it using pattern matching
  if (!brand) {
    // First pass: check for known wineries (exact match)
    for (const term of originalTerms) {
      const termLower = term.toLowerCase();
      if (KNOWN_WINERIES.some(w => termLower === w)) {
        brand = term; // Store original case
        break;
      }
    }
    
    // Second pass: identify regions and extract brand if not found
    for (const term of originalTerms) {
      const termLower = term.toLowerCase();
      
      // Check if it's a region (store ALL regions, including Lower Mainland)
      if (REGIONS.some(r => termLower === r)) {
        if (!region) region = term; // Store original case of first region found
        continue;
      }
      
      // If brand already found (from known wineries), just continue processing
      if (brand) continue;
      
      // Skip if it's a category indicator (use exact match to avoid false positives)
      // e.g., "wine" should match but "winery", "wines", or "Storied Wine Agency" should NOT
      const words = termLower.split(/\s+/);
      const isCategory = Object.values(CATEGORY_INDICATORS).some(indicators =>
        indicators.some(indicator => {
          // Only match if the ENTIRE term equals the indicator (single word category)
          // This prevents "Storied Wine Agency" from matching "wine"
          if (termLower === indicator) return true;
          
          // If it's a multi-word term, don't treat it as a category indicator
          // Multi-word terms are likely brand names even if they contain category words
          if (words.length > 1) return false;
          
          // For single-word terms, exclude common brand-like suffixes
          if (termLower.includes('winery') || termLower.includes('wines') || 
              termLower.includes('vineyards') || termLower.includes('cellars') ||
              termLower.includes('estate')) {
            return false; // This is likely a brand name, not a category
          }
          
          // Single word that matches a category indicator
          return termLower === indicator;
        })
      );
      if (isCategory) continue;
      
      // Skip if it's a wine type (use exact match to avoid false positives)
      // e.g., "white" should match but "whitehaven" should NOT
      const isWineType = Object.values(WINE_TYPES).some(types =>
        types.some(type => {
          // Exact match only for wine types to avoid matching brand names
          if (termLower === type) return true;
          // Word boundary match for multi-word types
          const regex = new RegExp(`^${type}$|\\b${type}\\b`, 'i');
          // Check it's not part of a longer brand name (more than just the type word)
          const words = termLower.split(/\s+/);
          if (words.length > 1) return false; // Multi-word terms are likely brands
          return regex.test(termLower);
        })
      );
      if (isWineType) continue;
      
      // Skip if it's noise
      if (NOISE_WORDS.some(noise => termLower === noise)) continue;
      
      // This must be the brand
      brand = term;
    }
  } else {
    // Brand came from registry, but still extract region
    for (const term of originalTerms) {
      const termLower = term.toLowerCase();
      if (REGIONS.some(r => termLower === r)) {
        if (!region) region = term;
        break;
      }
    }
  }

  if (!brand) return null;

  // Build sort key based on hierarchy (Wine → Spirits → Cider → Non-Alc)
  // Note: Wine type is NOT included in sortKey so brands are alphabetized across all wine types
  const primarySortOrder = {
    wine: '1',
    spirits: '2',
    cider: '3',
    nonAlc: '4',
  };

  // SortKey format: {categoryNum}-{category}-{brandName}
  // Example: "1-wine-Synchromesh"
  let sortKey = `${primarySortOrder[primaryCategory]}-${primaryCategory}-${brand}`;

  return {
    brand,
    primaryCategory,
    wineType,
    region,
    sortKey,
  };
}

/**
 * Format parsed collection into standardized display string
 * Format: Category | Type | Brand (region is stored but NOT displayed)
 * Example: "Wine | White | Synchromesh"
 */
export function formatCollection(parsed: ParsedCollection): string {
  const parts: string[] = [];
  
  // Category (capitalized)
  parts.push(parsed.primaryCategory.charAt(0).toUpperCase() + parsed.primaryCategory.slice(1));
  
  // Type (if wine)
  if (parsed.wineType) {
    parts.push(parsed.wineType.charAt(0).toUpperCase() + parsed.wineType.slice(1));
  }
  
  // Brand
  parts.push(parsed.brand);
  
  // Note: Region is stored in the data but NOT displayed in the formatted string
  
  return parts.join(' | ');
}

/**
 * Extract wine type from product name (fallback for when collection string doesn't have it)
 * Used primarily for non-alcoholic wines where type is in the product name
 * 
 * Example: "Ones Sparkling White 200 ml" → "sparkling" or "white"
 */
export function extractWineTypeFromProductName(productName: string): 'sparkling' | 'white' | 'rosé' | 'red' | undefined {
  if (!productName) return undefined;
  
  const nameLower = productName.toLowerCase();
  
  // Check in priority order (sparkling is most specific, red is least specific)
  if (WINE_TYPES.sparkling.some(indicator => nameLower.includes(indicator))) {
    return 'sparkling';
  }
  if (WINE_TYPES.rosé.some(indicator => nameLower.includes(indicator))) {
    return 'rosé';
  }
  if (WINE_TYPES.white.some(indicator => nameLower.includes(indicator))) {
    return 'white';
  }
  if (WINE_TYPES.red.some(indicator => nameLower.includes(indicator))) {
    return 'red';
  }
  
  return undefined;
}

/**
 * Get display name from sort key (strips sorting prefix)
 * 
 * Sort key formats:
 * - "1-cider-Salt Spring Wild" → "Salt Spring Wild"
 * - "2-wine-1-white-Synchromesh" → "Synchromesh"
 * - "4-nonAlc-Ones+ Non-Alc BC Wine" → "Ones+ Non-Alc BC Wine"
 */
export function getDisplayName(sortKey: string): string {
  // Sort keys have format: {num}-{category}-[{num}-{subtype}-]{brandName}
  // Wine has extra segments: "2-wine-1-white-BrandName"
  // Others: "1-cider-BrandName" or "3-spirits-BrandName" or "4-nonAlc-BrandName"
  
  // Strategy: Remove leading numeric and category prefixes
  // Match pattern: starts with digit(s), hyphen, letters, hyphen, optionally (digit(s), hyphen, letters, hyphen)
  // Everything after those prefixes is the brand name (which may contain hyphens)
  
  const match = sortKey.match(/^\d+-\w+(?:-\d+-\w+)?-(.+)$/);
  if (match) {
    return match[1]; // Return captured brand name
  }
  
  // Fallback: if format doesn't match, return as-is
  return sortKey;
}

/**
 * Inject manualSortIndex onto products based on brand registry productOrder
 * 
 * @param products - Array of products to process
 * @param brandRegistry - Brand registry data with productOrder field
 * @returns Products with manualSortIndex injected (undefined if no manual order set)
 */
export interface ProductWithSortIndex {
  id: string;
  category: string;
  product: string;
  collectionBrand?: string;
  manualSortIndex?: number;
  [key: string]: any;
}

export interface BrandWithOrder {
  brandName: string;
  productOrder?: string[] | null;
  [key: string]: any;
}

export function injectManualSortIndex(
  products: any[],
  brandRegistry: BrandWithOrder[]
): ProductWithSortIndex[] {
  // Create lookup map: brandName -> productOrder array
  const brandOrderMap = new Map<string, string[]>();
  
  brandRegistry.forEach(brand => {
    if (brand.productOrder && Array.isArray(brand.productOrder) && brand.productOrder.length > 0) {
      brandOrderMap.set(brand.brandName, brand.productOrder);
    }
  });
  
  // Inject manualSortIndex onto each product
  return products.map(product => {
    const brandName = product.collectionBrand;
    
    if (brandName && brandOrderMap.has(brandName)) {
      const productOrder = brandOrderMap.get(brandName)!;
      const sortIndex = productOrder.indexOf(product.id);
      
      // Only set manualSortIndex if product is found in the order array
      if (sortIndex !== -1) {
        return {
          ...product,
          manualSortIndex: sortIndex,
        };
      }
    }
    
    // No manual order set for this product's brand, or product not in order array
    return product;
  });
}
