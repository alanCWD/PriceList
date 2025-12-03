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
  skus?: string[] | null;
}

export interface SKUMappingResult {
  brandName: string;
  category: 'cider' | 'wine' | 'spirits' | 'nonAlc';
  matched: boolean;
}

/**
 * Look up a product's brand by its SKU using the brand registry
 * This is the primary method for matching products to brands
 * Only falls back to heuristics if registry is empty or SKU not found
 */
export function lookupBrandBySKU(
  sku: string,
  brandRegistry: BrandRegistryEntry[]
): SKUMappingResult | null {
  if (!sku || !brandRegistry || brandRegistry.length === 0) {
    return null;
  }

  // Find the brand that has this SKU in its skus array
  for (const brand of brandRegistry) {
    if (brand.skus && Array.isArray(brand.skus)) {
      if (brand.skus.includes(sku)) {
        return {
          brandName: brand.brandName,
          category: brand.category,
          matched: true,
        };
      }
    }
  }

  return null;
}

/**
 * Check if the brand registry has any SKU mappings
 * Used to determine if we should use SKU-based matching or heuristics
 */
export function registryHasSKUMappings(brandRegistry: BrandRegistryEntry[]): boolean {
  if (!brandRegistry || brandRegistry.length === 0) {
    return false;
  }
  
  // Registry has SKU mappings if at least one brand has non-empty skus array
  return brandRegistry.some(b => b.skus && Array.isArray(b.skus) && b.skus.length > 0);
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
      const productWords = nameLower.split(/\s+/);
      
      // Helper to normalize strings for comparison (remove punctuation but keep alphanumeric)
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const normalizedProductName = normalize(nameLower);
      const normalizedProductWords = normalizedProductName.split(/\s+/);
      
      // Helper to extract words from brand (stripped of punctuation)
      const getBrandWords = (brand: string) => normalize(brand).split(/\s+/);
      
      // TRAILING descriptor/suffix words that product names typically don't include
      // These are stripped from the END of brand names only
      const trailingDescriptorWords = new Set([
        'wine', 'wines', 'winery', 'vineyards', 'vineyard', 'estates', 'estate', 'cellars', 'cellar',
        'spirits', 'spirit', 'distillery', 'distilling',
        'cider', 'cidery',
        'brewing', 'brewery', 'beer', 'beers',
        'co', 'company', 'inc', 'ltd',
      ]);
      
      // Middle filler words that can be ignored during matching (but kept if at start)
      const fillerWords = new Set(['and', 'the', 'of', 'bc', 'okanagan', 'island', 'valley', 'non', 'alc', 'alcoholic']);
      
      // Helper to get identity words from brand:
      // 1. Strip trailing descriptor words (winery, wines, estate, etc.)
      // 2. Keep leading words (even "The" or "And" if they start the name)
      // 3. Remove middle filler words
      const getBrandIdentityWords = (brand: string) => {
        const words = getBrandWords(brand);
        if (words.length === 0) return [];
        
        // First pass: remove trailing descriptor words
        let endIndex = words.length;
        while (endIndex > 0 && trailingDescriptorWords.has(words[endIndex - 1])) {
          endIndex--;
        }
        const trimmedWords = words.slice(0, endIndex);
        
        // If all words were descriptors, return the first word as identity
        if (trimmedWords.length === 0) {
          return words.slice(0, 1);
        }
        
        // Second pass: keep leading word(s), remove filler words from middle
        // Keep the first word unconditionally (it's the brand start)
        const result: string[] = [trimmedWords[0]];
        for (let i = 1; i < trimmedWords.length; i++) {
          if (!fillerWords.has(trimmedWords[i])) {
            result.push(trimmedWords[i]);
          }
        }
        
        return result;
      };
      
      // Sort brands by their identity words length (longest first) - more specific brands win
      const sortedBrands = [...brandRegistry]
        .filter(b => !!b.brandName)
        .sort((a, b) => {
          const aIdentity = getBrandIdentityWords(a.brandName).join(' ');
          const bIdentity = getBrandIdentityWords(b.brandName).join(' ');
          return bIdentity.length - aIdentity.length;
        });
      
      // Strategy 1: Match product name against brand's IDENTITY words (stripped of descriptors)
      // e.g., "Mt. Boucherie 2024 Chasselas" matches "Mt. Boucherie Estate Winery"
      // because identity words are ["mt", "boucherie"] and product starts with "mt boucherie"
      for (const entry of sortedBrands) {
        const brandIdentityWords = getBrandIdentityWords(entry.brandName);
        if (brandIdentityWords.length === 0) continue;
        
        const brandIdentityString = brandIdentityWords.join(' ');
        
        // Check if product name starts with the brand identity string
        if (normalizedProductName.startsWith(brandIdentityString)) {
          // Verify the match ends at a word boundary (space or end of string)
          const afterMatch = normalizedProductName.slice(brandIdentityString.length);
          if (afterMatch === '' || afterMatch.startsWith(' ')) {
            registryMatch = {
              brand: entry.brandName,
              category: entry.category,
            };
            break;
          }
        }
      }
      
      // Strategy 2: First word(s) match with identity word comparison
      // For brands where products use abbreviated names
      // e.g., "Ones Sparkling White" matches "Ones+ Non-Alc BC Wine"
      if (!registryMatch && normalizedProductWords.length > 0) {
        const potentialMatches: { entry: typeof sortedBrands[0]; matchedWords: number; score: number }[] = [];
        
        for (const entry of sortedBrands) {
          const brandIdentityWords = getBrandIdentityWords(entry.brandName);
          if (brandIdentityWords.length === 0) continue;
          
          // Count how many consecutive words match from the start
          let matchedWords = 0;
          for (let i = 0; i < Math.min(normalizedProductWords.length, brandIdentityWords.length); i++) {
            if (normalizedProductWords[i] === brandIdentityWords[i]) {
              matchedWords++;
            } else {
              break;
            }
          }
          
          // Only consider if at least the first word matches
          if (matchedWords > 0) {
            // Score: prefer more matched words, then fewer total identity words (more specific)
            // Higher matchedWords is better, lower identity word count is better
            potentialMatches.push({
              entry,
              matchedWords,
              score: brandIdentityWords.length - matchedWords, // Lower is better
            });
          }
        }
        
        // Pick the best match:
        // 1. Most matched words
        // 2. Fewest remaining identity words (more specific match)
        if (potentialMatches.length > 0) {
          potentialMatches.sort((a, b) => {
            if (b.matchedWords !== a.matchedWords) {
              return b.matchedWords - a.matchedWords; // More matched words first
            }
            return a.score - b.score; // Lower score (fewer unmatched) first
          });
          const bestMatch = potentialMatches[0];
          registryMatch = {
            brand: bestMatch.entry.brandName,
            category: bestMatch.entry.category,
          };
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
 * productOrder stores SKUs (not product IDs) because SKUs are stable across CSV uploads.
 * This allows manual ordering to persist when a new CSV is uploaded.
 * 
 * LEGACY SUPPORT: Some older entries store "product-X" IDs instead of SKUs.
 * The function handles both formats for backward compatibility.
 * 
 * @param products - Array of products to process
 * @param brandRegistry - Brand registry data with productOrder field (contains SKUs or legacy IDs)
 * @returns Products with manualSortIndex injected (undefined if no manual order set)
 */
export interface ProductWithSortIndex {
  id: string;
  sku: string;
  category: string;
  product: string;
  collectionBrand?: string;
  manualSortIndex?: number;
  [key: string]: any;
}

export interface BrandWithOrder {
  brandName: string;
  productOrder?: string[] | null; // Array of SKUs (or legacy product-* IDs) in desired order
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
  
  // Build a product ID to SKU lookup for legacy "product-*" format support
  const productIdToSku = new Map<string, string>();
  products.forEach(p => {
    if (p.id && p.sku) {
      productIdToSku.set(p.id, p.sku);
    }
  });
  
  // Inject manualSortIndex onto each product based on SKU or legacy ID match
  return products.map(product => {
    const brandName = product.collectionBrand;
    const sku = product.sku;
    const productId = product.id;
    
    // Skip if product has no brand - can't apply manual ordering
    if (!brandName) {
      return product;
    }
    
    // Check if this brand has a custom order defined
    if (brandOrderMap.has(brandName)) {
      const productOrder = brandOrderMap.get(brandName)!;
      
      // PRIORITY 1: Try to match by SKU (preferred, stable across uploads)
      if (sku) {
        const skuIndex = productOrder.indexOf(sku);
        if (skuIndex !== -1) {
          return {
            ...product,
            manualSortIndex: skuIndex,
          };
        }
      }
      
      // PRIORITY 2: Try to match by legacy "product-*" ID format
      if (productId) {
        const legacyIndex = productOrder.indexOf(productId);
        if (legacyIndex !== -1) {
          return {
            ...product,
            manualSortIndex: legacyIndex,
          };
        }
      }
      
      // Product not found in order array (new product added after order was set)
      // Falls through to return without manualSortIndex - will use automatic sorting
    }
    
    // No manual order set for this product's brand, or product not in order array
    return product;
  });
}
