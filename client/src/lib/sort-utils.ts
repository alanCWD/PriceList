import type { Product } from "@shared/schema";

/**
 * Brand ordering data from the Brand Registry
 */
export interface BrandOrderingEntry {
  brandName: string;
  category: 'cider' | 'wine' | 'spirits' | 'nonAlc';
  displayOrder: number | null;
  productOrder: string[] | null;
}

/**
 * Category order priority (Wine → Spirits → Cider → Non-Alc)
 */
const CATEGORY_ORDER: Record<string, number> = {
  wine: 1,
  spirits: 2,
  cider: 3,
  nonAlc: 4,
};

/**
 * Get canonical sortKey for a product group
 * Handles both new format (1-wine-Brand) and legacy data
 * 
 * @param products Array of products in the brand group
 * @returns Canonical sortKey for sorting (e.g., "1-wine-synchromesh")
 */
export function getGroupSortKey(products: Product[]): string {
  if (!products || products.length === 0) return 'zzz-uncategorized-zzz';
  
  // Try to find a product with valid new-format sortKey
  const newFormatPattern = /^[1-4]-(?:wine|spirits|cider|nonAlc)-/;
  const productWithValidKey = products.find(p => p.category && newFormatPattern.test(p.category));
  
  if (productWithValidKey?.category) {
    return productWithValidKey.category;
  }
  
  // Fallback: construct sortKey from ANY available metadata
  const categoryPrefix: Record<string, string> = {
    wine: '1',
    spirits: '2',
    cider: '3',
    nonAlc: '4',
  };
  
  // Search all products for the best available metadata
  let category = '';
  let brand = '';
  
  for (const product of products) {
    if (!category && product.collectionCategory) {
      category = product.collectionCategory.toLowerCase().trim();
    }
    if (!brand && product.collectionBrand) {
      brand = product.collectionBrand.toLowerCase().trim();
    }
    if (!brand && product.category) {
      brand = product.category.toLowerCase().trim();
    }
    // If we have both, stop searching
    if (category && brand) break;
  }
  
  const prefix = categoryPrefix[category] || '9';
  
  // Ensure deterministic sorting even with completely missing metadata
  return `${prefix}-${category || 'uncategorized'}-${brand || 'zzz'}`;
}

/**
 * Sort brand groups using Brand Registry ordering data
 * Priority: category order (Wine → Spirits → Cider → Non-Alc) > displayOrder > alphabetical
 * 
 * @param groupedProducts Array of [brandName, products[]] tuples
 * @param brandOrdering Brand ordering data from the Brand Registry (optional)
 * @returns Sorted array of [brandName, products[]] tuples
 */
export function sortBrandGroups(
  groupedProducts: [string, Product[]][], 
  brandOrdering?: BrandOrderingEntry[]
): [string, Product[]][] {
  // Build lookup map for fast access to brand ordering data
  const brandOrderMap = new Map<string, BrandOrderingEntry>();
  if (brandOrdering) {
    brandOrdering.forEach(entry => {
      brandOrderMap.set(entry.brandName, entry);
    });
  }

  return groupedProducts.sort(([brandA, productsA], [brandB, productsB]) => {
    // Get brand registry entries for both brands
    const entryA = brandOrderMap.get(brandA);
    const entryB = brandOrderMap.get(brandB);
    
    // Get categories (from registry or fallback to product metadata)
    const categoryA = entryA?.category || getProductCategory(productsA);
    const categoryB = entryB?.category || getProductCategory(productsB);
    
    // Primary sort: by category order (Wine → Spirits → Cider → Non-Alc)
    const categoryOrderA = CATEGORY_ORDER[categoryA] || 9;
    const categoryOrderB = CATEGORY_ORDER[categoryB] || 9;
    
    if (categoryOrderA !== categoryOrderB) {
      return categoryOrderA - categoryOrderB;
    }
    
    // Secondary sort: by displayOrder if available (null = alphabetical)
    const displayOrderA = entryA?.displayOrder;
    const displayOrderB = entryB?.displayOrder;
    
    // Brands with displayOrder come before those without
    if (displayOrderA !== null && displayOrderA !== undefined && 
        (displayOrderB === null || displayOrderB === undefined)) {
      return -1;
    }
    if ((displayOrderA === null || displayOrderA === undefined) && 
        displayOrderB !== null && displayOrderB !== undefined) {
      return 1;
    }
    
    // Both have displayOrder - sort by it
    if (displayOrderA !== null && displayOrderA !== undefined && 
        displayOrderB !== null && displayOrderB !== undefined) {
      return displayOrderA - displayOrderB;
    }
    
    // Tertiary sort: alphabetical by brand name
    return brandA.localeCompare(brandB);
  });
}

/**
 * Extract category from products (fallback when no brand registry entry)
 */
function getProductCategory(products: Product[]): string {
  for (const product of products) {
    if (product.collectionCategory) {
      return product.collectionCategory.toLowerCase().trim();
    }
    // Try to extract from sortKey format (e.g., "1-wine-Brand")
    if (product.category) {
      const match = product.category.match(/^[1-4]-(\w+)-/);
      if (match) {
        return match[1];
      }
    }
  }
  return 'uncategorized';
}
