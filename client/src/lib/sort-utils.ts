import type { Product } from "@shared/schema";

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
 * Sort brand groups by canonical sortKey with brand name tiebreaker
 * Ensures Wine → Spirits → Cider → NonAlc order with alphabetical brands
 * 
 * @param groupedProducts Array of [brandName, products[]] tuples
 * @returns Sorted array of [brandName, products[]] tuples
 */
export function sortBrandGroups(groupedProducts: [string, Product[]][]): [string, Product[]][] {
  return groupedProducts.sort(([brandA, productsA], [brandB, productsB]) => {
    const sortKeyA = getGroupSortKey(productsA);
    const sortKeyB = getGroupSortKey(productsB);
    
    // Primary sort by canonical sortKey
    const keyComparison = sortKeyA.localeCompare(sortKeyB);
    if (keyComparison !== 0) return keyComparison;
    
    // Secondary sort by brand name for consistency
    return brandA.localeCompare(brandB);
  });
}
