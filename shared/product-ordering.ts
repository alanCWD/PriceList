export interface OrderableProduct {
  id: string;
  sku: string;
  product: string;
  collectionType?: string;
}

export interface BrandProductOrder {
  brandName: string;
  productOrder?: string[] | null;
}

const WINE_TYPE_ORDER: Record<string, number> = {
  sparkling: 1,
  white: 2,
  rose: 3,
  rosé: 3,
  red: 4,
};

function getFallbackWineType(product: OrderableProduct): string {
  const type = product.collectionType?.toLowerCase() || "";
  if (type !== "sparkling") return type;

  const productName = product.product.toLowerCase();
  if (productName.includes("white")) return "white";
  if (productName.includes("rosé") || productName.includes("rose") || productName.includes("pink")) {
    return "rosé";
  }
  if (productName.includes("red")) return "red";

  return type;
}

function buildSavedPositionLookup(
  products: readonly OrderableProduct[],
  productOrder?: readonly string[] | null,
) {
  const skuCounts = new Map<string, number>();
  for (const product of products) {
    const sku = product.sku.trim();
    if (sku) {
      skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
    }
  }

  const skuPositions = new Map<string, number>();
  const legacyIdPositions = new Map<string, number>();
  productOrder?.forEach((rawEntry, index) => {
    const entry = rawEntry.trim();
    if (!entry) return;

    if (entry.startsWith("product-")) {
      if (!legacyIdPositions.has(entry)) {
        legacyIdPositions.set(entry, index);
      }
    } else if (!skuPositions.has(entry)) {
      skuPositions.set(entry, index);
    }
  });

  return (product: OrderableProduct): number | undefined => {
    const sku = product.sku.trim();
    if (sku && skuCounts.get(sku) === 1) {
      return skuPositions.get(sku);
    }

    return legacyIdPositions.get(product.id);
  };
}

/**
 * Sorts a single brand's current products using its saved SKU sequence.
 *
 * Saved positions are applied only to unique current SKUs. New, blank,
 * duplicate, and stale-SKU cases fall back to a deterministic wine-type/name/
 * SKU/ID sequence without changing the saved registry order.
 */
export function sortProductsBySavedSkuOrder<T extends OrderableProduct>(
  products: readonly T[],
  productOrder?: readonly string[] | null,
): T[] {
  const getSavedPosition = buildSavedPositionLookup(products, productOrder);

  return [...products].sort((a, b) => {
    const savedPositionA = getSavedPosition(a);
    const savedPositionB = getSavedPosition(b);
    const hasSavedPositionA = savedPositionA !== undefined;
    const hasSavedPositionB = savedPositionB !== undefined;

    if (hasSavedPositionA && hasSavedPositionB) {
      return savedPositionA - savedPositionB;
    }
    if (hasSavedPositionA) return -1;
    if (hasSavedPositionB) return 1;

    const typeA = a.collectionType?.toLowerCase() || "";
    const typeB = b.collectionType?.toLowerCase() || "";
    const fallbackTypeA = getFallbackWineType(a);
    const fallbackTypeB = getFallbackWineType(b);
    const wineTypeComparison = (WINE_TYPE_ORDER[fallbackTypeA] || 999)
      - (WINE_TYPE_ORDER[fallbackTypeB] || 999);
    if (wineTypeComparison !== 0) return wineTypeComparison;

    if (typeA === "sparkling" && typeB !== "sparkling") return -1;
    if (typeA !== "sparkling" && typeB === "sparkling") return 1;

    const nameComparison = (a.product || "").localeCompare(b.product || "");
    if (nameComparison !== 0) return nameComparison;

    const skuComparison = (a.sku || "").localeCompare(b.sku || "");
    if (skuComparison !== 0) return skuComparison;

    return a.id.localeCompare(b.id);
  });
}

/**
 * Applies each registry brand's saved product order to its corresponding group.
 * Products belonging to an unregistered group use the deterministic fallback.
 */
export function sortProductsByBrandRegistryOrder<T extends OrderableProduct>(
  productsByBrand: Record<string, readonly T[]>,
  brandRegistry?: readonly BrandProductOrder[],
): Record<string, T[]> {
  const savedOrderByBrand = new Map(
    (brandRegistry || []).map((brand) => [brand.brandName, brand.productOrder]),
  );

  return Object.fromEntries(
    Object.entries(productsByBrand).map(([brandName, products]) => [
      brandName,
      sortProductsBySavedSkuOrder(products, savedOrderByBrand.get(brandName)),
    ]),
  );
}