import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateBrandSkuMemberships,
  repairBrandOrderFromPricelist,
} from "./brand-registry-repair";
import { sortFlatProductsByBrandRegistryOrder } from "./product-ordering";

const product = (sku: string, name: string, collectionBrand: string) => ({
  id: `product-${sku}`,
  sku,
  product: name,
  category: `1-wine-${collectionBrand}`,
  format: "750ml",
  price: "10.00",
  collectionBrand,
});

test("repairs target order from current pricelist rows and removes conflicting ownership", () => {
  const brands = [
    {
      id: 19,
      brandName: "Mt. Boucherie",
      skus: ["MT-1", "SHARED", "MT-2"],
      productOrder: ["MT-2", "SHARED"],
    },
    {
      id: 20,
      brandName: "Synchromesh",
      skus: ["SHARED", "SYN-1"],
      productOrder: ["SYN-1", "SHARED"],
    },
  ];
  const products = [
    product("MT-2", "Mt Two", "Mt. Boucherie"),
    product("SHARED", "Synchromesh Pinot Noir", "Synchromesh"),
    product("MT-1", "Mt One", "Mt. Boucherie"),
    product("SYN-1", "Syn One", "Synchromesh"),
  ];

  const result = repairBrandOrderFromPricelist(products, 19, brands);
  const mtUpdate = result.updates.find((update) => update.id === 19)!;

  assert.deepEqual(mtUpdate.skus, ["MT-1", "MT-2"]);
  assert.deepEqual(mtUpdate.productOrder, ["MT-2", "MT-1"]);
  assert.deepEqual(result.removedMemberships, [
    { sku: "SHARED", brandName: "Mt. Boucherie" },
  ]);
});

test("detects duplicate SKU ownership before registry writes", () => {
  assert.deepEqual(
    findDuplicateBrandSkuMemberships([
      { brandName: "One", skus: ["A", "SHARED"] },
      { brandName: "Two", skus: ["SHARED", "B"] },
    ]),
    [{ sku: "SHARED", brandNames: ["One", "Two"] }],
  );
});

test("preserves the repaired pricelist order through a later import", () => {
  const brands = [{
    id: 19,
    brandName: "Mt. Boucherie",
    skus: ["MT-1", "MT-2"],
    productOrder: ["MT-1", "MT-2"],
  }];
  const repair = repairBrandOrderFromPricelist(
    [
      product("MT-2", "Mt Two", "Mt. Boucherie"),
      product("MT-1", "Mt One", "Mt. Boucherie"),
    ],
    19,
    brands,
  );
  const repairedBrand = { ...brands[0], ...repair.updates[0] };

  const laterImport = [
    product("MT-1", "Mt One Renamed", "Mt. Boucherie"),
    product("OTHER", "Unassigned", "Other"),
    product("MT-2", "Mt Two", "Mt. Boucherie"),
  ];
  const ordered = sortFlatProductsByBrandRegistryOrder(laterImport, [repairedBrand]);

  assert.deepEqual(ordered.map((item) => item.sku), ["MT-2", "OTHER", "MT-1"]);
});

test("refuses to guess ownership when current producer metadata is ambiguous", () => {
  assert.throws(
    () => repairBrandOrderFromPricelist(
      [product("SHARED", "Shared", "Unregistered")],
      1,
      [
        { id: 1, brandName: "One", skus: ["SHARED"] },
        { id: 2, brandName: "Two", skus: ["SHARED"] },
      ],
    ),
    /cannot resolve the conflict/,
  );
});