import type { Pricelist } from "./schema";

export function findProductIndex(
  products: readonly Pricelist["products"][number][],
  target: { sku?: string; id?: string },
): number {
  if (target.sku) {
    const skuIndex = products.findIndex((product) => product.sku === target.sku);
    if (skuIndex !== -1) return skuIndex;
  }

  return target.id
    ? products.findIndex((product) => product.id === target.id)
    : -1;
}