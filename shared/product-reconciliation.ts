export interface ProductIdentity {
  id: string;
  sku: string;
}

/**
 * Returns non-empty SKUs that occur more than once in one import.
 *
 * A blank SKU is allowed, but it has no stable identity and therefore cannot
 * inherit settings from an earlier upload.
 */
export function findDuplicateSkus(products: readonly ProductIdentity[]): string[] {
  const counts = new Map<string, number>();

  for (const product of products) {
    const sku = product.sku.trim();
    if (sku) {
      counts.set(sku, (counts.get(sku) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([sku]) => sku)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Applies stable product IDs to a fresh import using SKU as the identity.
 *
 * All mutable fields, including the product name, remain from the newly
 * imported row. IDs are preserved only when that SKU is unique in both lists,
 * so duplicate or blank SKUs can never silently inherit another row's state.
 */
export function reconcileProductIdsBySku<T extends ProductIdentity>(
  existingProducts: readonly ProductIdentity[],
  importedProducts: readonly T[],
): { products: T[]; duplicateSkus: string[] } {
  const duplicateSkus = findDuplicateSkus(importedProducts);
  const duplicateSkuSet = new Set(duplicateSkus);
  const existingSkuCounts = new Map<string, number>();
  const existingProductIdCounts = new Map<string, number>();

  for (const product of existingProducts) {
    const sku = product.sku.trim();
    if (sku) {
      existingSkuCounts.set(sku, (existingSkuCounts.get(sku) || 0) + 1);
    }
    existingProductIdCounts.set(product.id, (existingProductIdCounts.get(product.id) || 0) + 1);
  }

  const existingProductIdBySku = new Map<string, string>();
  for (const product of existingProducts) {
    const sku = product.sku.trim();
    if (
      sku &&
      existingSkuCounts.get(sku) === 1 &&
      existingProductIdCounts.get(product.id) === 1
    ) {
      existingProductIdBySku.set(sku, product.id);
    }
  }

  const usedIds = new Set<string>();
  const makeUniqueId = (preferredId: string): string => {
    if (!usedIds.has(preferredId)) {
      usedIds.add(preferredId);
      return preferredId;
    }

    let suffix = 2;
    let candidate = `${preferredId}-${suffix}`;
    while (usedIds.has(candidate)) {
      suffix += 1;
      candidate = `${preferredId}-${suffix}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  return {
    duplicateSkus,
    products: importedProducts.map((product) => {
      const sku = product.sku.trim();
      const existingId = sku && !duplicateSkuSet.has(sku)
        ? existingProductIdBySku.get(sku)
        : undefined;
      const uniqueId = makeUniqueId(existingId || product.id);

      return uniqueId === product.id ? product : { ...product, id: uniqueId };
    }),
  };
}