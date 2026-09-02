import type { Pricelist } from "./schema";

export function findProductIndicesBySku(
  products: readonly Pricelist["products"][number][],
  sku: string,
): number[] {
  return products.reduce<number[]>((matches, product, index) => {
    if (product.sku === sku) matches.push(index);
    return matches;
  }, []);
}

export function findProductIndicesById(
  products: readonly Pricelist["products"][number][],
  id: string,
): number[] {
  return products.reduce<number[]>((matches, product, index) => {
    if (product.id === id) matches.push(index);
    return matches;
  }, []);
}

export function findProductIndex(
  products: readonly Pricelist["products"][number][],
  target: { sku?: string; id?: string },
): number {
  if (target.sku) {
    const skuMatches = findProductIndicesBySku(products, target.sku);
    if (skuMatches.length === 1) return skuMatches[0];
    if (skuMatches.length > 1) return -1;
  }

  if (!target.id) return -1;
  const idMatches = findProductIndicesById(products, target.id);
  return idMatches.length === 1 ? idMatches[0] : -1;
}