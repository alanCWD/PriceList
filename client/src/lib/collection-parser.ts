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
  red: ['red', 'noir', 'merlot', 'cabernet', 'syrah', 'pinot noir'],
};

// Regions to ignore (not brand names)
const REGIONS = [
  'okanagan',
  'vancouver island',
  'similkameen',
  'fraser valley',
  'gulf islands',
  'kootenays',
  'bc',
  'british columbia',
];

// Noise words to ignore
const NOISE_WORDS = ['keg', 'bottle', 'can'];

interface ParsedCollection {
  brand: string;
  primaryCategory: 'cider' | 'wine' | 'spirits' | 'nonAlc';
  wineType?: 'sparkling' | 'white' | 'red';
  sortKey: string; // e.g., "1-Cider-Salt Spring Wild" or "2-Wine-White-Synchromesh"
}

/**
 * Parse collection string to extract brand and categorization
 */
export function parseCollection(collectionString: string): ParsedCollection | null {
  if (!collectionString) return null;

  // Split by semicolon and clean up terms
  const terms = collectionString
    .split(';')
    .map(term => term.trim())
    .filter(term => term.length > 0)
    .map(term => term.toLowerCase());

  // Determine primary category
  let primaryCategory: 'cider' | 'wine' | 'spirits' | 'nonAlc' | null = null;
  
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

  if (!primaryCategory) return null;

  // Determine wine type if it's wine category
  let wineType: 'sparkling' | 'white' | 'red' | undefined;
  if (primaryCategory === 'wine') {
    for (const term of terms) {
      if (WINE_TYPES.sparkling.some(indicator => term.includes(indicator))) {
        wineType = 'sparkling';
        break;
      }
      if (WINE_TYPES.white.some(indicator => term.includes(indicator))) {
        wineType = 'white';
        break;
      }
      if (WINE_TYPES.red.some(indicator => term.includes(indicator))) {
        wineType = 'red';
        break;
      }
    }
  }

  // Extract brand name - it's the term that's not a category, region, or noise word
  let brand = '';
  const originalTerms = collectionString.split(';').map(t => t.trim()).filter(t => t.length > 0);
  
  for (const term of originalTerms) {
    const termLower = term.toLowerCase();
    
    // Skip if it's a category indicator
    const isCategory = Object.values(CATEGORY_INDICATORS).some(indicators =>
      indicators.some(indicator => termLower.includes(indicator))
    );
    if (isCategory) continue;
    
    // Skip if it's a wine type
    const isWineType = Object.values(WINE_TYPES).some(types =>
      types.some(type => termLower.includes(type))
    );
    if (isWineType) continue;
    
    // Skip if it's a region
    if (REGIONS.some(region => termLower === region)) continue;
    
    // Skip if it's noise
    if (NOISE_WORDS.some(noise => termLower === noise)) continue;
    
    // This must be the brand
    brand = term;
    break;
  }

  if (!brand) return null;

  // Build sort key based on hierarchy
  const primarySortOrder = {
    cider: '1',
    wine: '2',
    spirits: '3',
    nonAlc: '4',
  };

  const wineTypeSortOrder = {
    sparkling: '1',
    white: '2',
    red: '3',
  };

  let sortKey = `${primarySortOrder[primaryCategory]}-${primaryCategory}`;
  
  if (wineType) {
    sortKey += `-${wineTypeSortOrder[wineType]}-${wineType}`;
  }
  
  sortKey += `-${brand}`;

  return {
    brand,
    primaryCategory,
    wineType,
    sortKey,
  };
}

/**
 * Get display name from sort key (strips sorting prefix)
 */
export function getDisplayName(sortKey: string): string {
  // Extract brand from sort key like "2-wine-1-white-Synchromesh"
  const parts = sortKey.split('-');
  return parts[parts.length - 1];
}
