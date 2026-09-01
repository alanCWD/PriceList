import type { BrandProductMembership, OrderableProduct } from "./product-ordering";

export function moveBrandProductBySku<T extends OrderableProduct>(
  products: readonly T[],
  draggedSku: string,
  targetSku: string,
): T[] {
  const draggedIndex = products.findIndex((product) => product.sku === draggedSku);
  const targetIndex = products.findIndex((product) => product.sku === targetSku);
  if (draggedIndex === -1 || targetIndex === -1) {
    throw new Error("Dragged and target products must belong to the selected brand");
  }

  const reordered = [...products];
  const [draggedProduct] = reordered.splice(draggedIndex, 1);
  reordered.splice(targetIndex, 0, draggedProduct);
  return reordered;
}

export function reorderBrandProductsBySku<T extends OrderableProduct>(
  products: readonly T[],
  brandName: string,
  orderedSkus: readonly string[],
  brandRegistry: readonly BrandProductMembership[],
): T[] {
  const brand = brandRegistry.find((candidate) => candidate.brandName === brandName);
  if (!brand) {
    throw new Error(`Brand "${brandName}" does not exist`);
  }

  // Match the grouped Brand Registry API's ownership rule exactly. A legacy
  // SKU may exist in more than one registry row; the final registry entry is
  // its canonical owner until that bad membership is cleaned up.
  const brandNameBySku = new Map<string, string>();
  for (const registryBrand of brandRegistry) {
    for (const rawSku of registryBrand.skus || []) {
      const sku = rawSku.trim();
      if (sku) brandNameBySku.set(sku, registryBrand.brandName);
    }
  }
  const currentBrandProducts = products.filter((product) =>
    brandNameBySku.get(product.sku.trim()) === brandName,
  );
  const currentSkus = currentBrandProducts.map((product) => product.sku.trim());
  const normalizedOrder = orderedSkus.map((sku) => sku.trim());

  if (
    normalizedOrder.some((sku) => !sku)
    || new Set(normalizedOrder).size !== normalizedOrder.length
  ) {
    throw new Error("Each reordered product must have one unique SKU");
  }

  if (
    normalizedOrder.length !== currentSkus.length
    || normalizedOrder.some((sku) => !currentSkus.includes(sku))
    || currentSkus.some((sku) => !normalizedOrder.includes(sku))
  ) {
    throw new Error("Reorder must include every current product in the selected brand");
  }

  const productBySku = new Map(
    currentBrandProducts.map((product) => [product.sku.trim(), product]),
  );
  const orderedProducts = normalizedOrder.map((sku) => productBySku.get(sku)!);
  let nextBrandIndex = 0;

  return products.map((product) => {
    if (brandNameBySku.get(product.sku.trim()) !== brandName) return product;
    return orderedProducts[nextBrandIndex++];
  });
}