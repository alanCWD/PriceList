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

  const registrySkus = new Set(
    (brand.skus || []).map((sku) => sku.trim()).filter(Boolean),
  );
  const currentBrandProducts = products.filter((product) =>
    registrySkus.has(product.sku.trim()),
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
    if (!registrySkus.has(product.sku.trim())) return product;
    return orderedProducts[nextBrandIndex++];
  });
}