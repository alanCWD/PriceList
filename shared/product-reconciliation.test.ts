import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateSkus,
  reconcileProductIdsBySku,
} from "./product-reconciliation";

test("keeps a product ID when a Wix export renames a matching SKU", () => {
  const existing = [{
    id: "product-42",
    sku: "MAC-FAST-FRIENDS",
    product: "Macaloney's Island Drams Tasting Pack",
    price: "$75.00",
  }];
  const imported = [{
    id: "product-0",
    sku: "MAC-FAST-FRIENDS",
    product: "Macaloney's Fast Friends Sample Pack",
    price: "$80.00",
  }];

  const result = reconcileProductIdsBySku(existing, imported);

  assert.deepEqual(result.duplicateSkus, []);
  assert.equal(result.products[0].id, "product-42");
  assert.equal(result.products[0].product, "Macaloney's Fast Friends Sample Pack");
  assert.equal(result.products[0].price, "$80.00");
});

test("matches reordered imports by SKU rather than generated row ID", () => {
  const result = reconcileProductIdsBySku(
    [
      { id: "product-0", sku: "SKU-A" },
      { id: "product-1", sku: "SKU-B" },
    ],
    [
      { id: "product-0", sku: "SKU-B" },
      { id: "product-1", sku: "SKU-A" },
    ],
  );

  assert.deepEqual(result.products.map((product) => product.id), ["product-1", "product-0"]);
});

test("does not reconcile blank or duplicate SKUs", () => {
  const imported = [
    { id: "new-blank", sku: "" },
    { id: "new-1", sku: "DUPLICATE" },
    { id: "new-2", sku: "DUPLICATE" },
  ];
  const result = reconcileProductIdsBySku(
    [
      { id: "old-blank", sku: "" },
      { id: "old-duplicate", sku: "DUPLICATE" },
    ],
    imported,
  );

  assert.deepEqual(findDuplicateSkus(imported), ["DUPLICATE"]);
  assert.deepEqual(result.duplicateSkus, ["DUPLICATE"]);
  assert.deepEqual(result.products.map((product) => product.id), ["new-blank", "new-1", "new-2"]);
});