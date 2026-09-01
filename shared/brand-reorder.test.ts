import assert from "node:assert/strict";
import test from "node:test";
import {
  moveBrandProductBySku,
  reorderBrandProductsBySku,
} from "./brand-reorder";

const registry = [
  { brandName: "Brand A", skus: ["A-1", "A-2"], productOrder: ["A-1", "A-2"] },
  { brandName: "Brand B", skus: ["B-1"], productOrder: ["B-1"] },
];

test("reorders a brand by SKU while preserving duplicate legacy IDs", () => {
  const products = [
    { id: "product-1", sku: "A-1", product: "A One" },
    { id: "product-2", sku: "B-1", product: "B One" },
    { id: "product-1", sku: "A-2", product: "A Two" },
    { id: "product-3", sku: "", product: "Unassigned" },
  ];

  const reordered = reorderBrandProductsBySku(
    products,
    "Brand A",
    ["A-2", "A-1"],
    registry,
  );

  assert.deepEqual(reordered.map((product) => product.sku), [
    "A-2",
    "B-1",
    "A-1",
    "",
  ]);
  assert.equal(reordered.length, products.length);
  assert.deepEqual(
    reordered.map((product) => product.product).sort(),
    products.map((product) => product.product).sort(),
  );
});

test("moves the intended non-first row when legacy IDs are duplicated", () => {
  const products = [
    { id: "product-1", sku: "A-1", product: "A One" },
    { id: "product-2", sku: "A-2", product: "A Two" },
    { id: "product-1", sku: "A-3", product: "A Three" },
  ];

  const reordered = moveBrandProductBySku(products, "A-3", "A-1");

  assert.deepEqual(
    reordered.map((product) => product.sku),
    ["A-3", "A-1", "A-2"],
  );
});

test("rejects duplicate or incomplete SKU sequences", () => {
  const products = [
    { id: "product-1", sku: "A-1", product: "A One" },
    { id: "product-2", sku: "A-2", product: "A Two" },
  ];

  assert.throws(
    () => reorderBrandProductsBySku(products, "Brand A", ["A-1", "A-1"], registry),
    /unique SKU/,
  );
  assert.throws(
    () => reorderBrandProductsBySku(products, "Brand A", ["A-1"], registry),
    /every current product/,
  );
});