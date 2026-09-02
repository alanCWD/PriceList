import type { Product } from "./schema";

export interface RepairableBrand {
  id: number;
  brandName: string;
  skus?: string[] | null;
  productOrder?: string[] | null;
}

export interface BrandRegistryRepairUpdate {
  id: number;
  skus: string[];
  productOrder: string[];
}

export function findDuplicateBrandSkuMemberships(
  brands: readonly Pick<RepairableBrand, "brandName" | "skus">[],
): Array<{ sku: string; brandNames: string[] }> {
  const ownersBySku = new Map<string, string[]>();
  for (const brand of brands) {
    for (const rawSku of brand.skus || []) {
      const sku = rawSku.trim();
      if (!sku) continue;
      const owners = ownersBySku.get(sku) || [];
      if (!owners.includes(brand.brandName)) owners.push(brand.brandName);
      ownersBySku.set(sku, owners);
    }
  }

  return Array.from(ownersBySku.entries())
    .filter(([, brandNames]) => brandNames.length > 1)
    .map(([sku, brandNames]) => ({ sku, brandNames }));
}

export function repairBrandOrderFromPricelist(
  products: readonly Product[],
  targetBrandId: number,
  brands: readonly RepairableBrand[],
): {
  updates: BrandRegistryRepairUpdate[];
  removedMemberships: Array<{ sku: string; brandName: string }>;
} {
  const targetBrand = brands.find((brand) => brand.id === targetBrandId);
  if (!targetBrand) throw new Error("Brand not found");

  const nextById = new Map(
    brands.map((brand) => [
      brand.id,
      {
        id: brand.id,
        brandName: brand.brandName,
        skus: Array.from(new Set((brand.skus || []).map((sku) => sku.trim()).filter(Boolean))),
        productOrder: Array.from(new Set((brand.productOrder || []).map((sku) => sku.trim()).filter(Boolean))),
      },
    ]),
  );
  const currentProductBySku = new Map(
    products
      .filter((product) => product.sku.trim())
      .map((product) => [product.sku.trim(), product]),
  );
  const removedMemberships: Array<{ sku: string; brandName: string }> = [];

  for (const conflict of findDuplicateBrandSkuMemberships(brands)) {
    if (!conflict.brandNames.includes(targetBrand.brandName)) continue;

    const product = currentProductBySku.get(conflict.sku);
    const canonicalBrandName = product?.collectionBrand?.trim();
    if (!canonicalBrandName || !conflict.brandNames.includes(canonicalBrandName)) {
      throw new Error(
        `SKU ${conflict.sku} belongs to multiple producers and its current producer cannot resolve the conflict`,
      );
    }

    for (const brand of Array.from(nextById.values())) {
      if (brand.brandName === canonicalBrandName || !brand.skus.includes(conflict.sku)) continue;
      brand.skus = brand.skus.filter((sku) => sku !== conflict.sku);
      brand.productOrder = brand.productOrder.filter((sku) => sku !== conflict.sku);
      removedMemberships.push({ sku: conflict.sku, brandName: brand.brandName });
    }
  }

  const repairedTarget = nextById.get(targetBrandId)!;
  const targetSkuSet = new Set(repairedTarget.skus);
  const orderedSkuSet = new Set<string>();
  repairedTarget.productOrder = products
    .map((product) => product.sku.trim())
    .filter((sku) => {
      if (!sku || !targetSkuSet.has(sku) || orderedSkuSet.has(sku)) return false;
      orderedSkuSet.add(sku);
      return true;
    });

  const changedBrandIds = new Set([
    targetBrandId,
    ...removedMemberships.map(({ brandName }) =>
      brands.find((brand) => brand.brandName === brandName)!.id,
    ),
  ]);

  return {
    updates: Array.from(changedBrandIds).map((id) => {
      const brand = nextById.get(id)!;
      return { id: brand.id, skus: brand.skus, productOrder: brand.productOrder };
    }),
    removedMemberships,
  };
}