import assert from "node:assert/strict";
import test from "node:test";
import { findProductIndex } from "./product-target";

test("targets the requested SKU when legacy IDs are shared", () => {
  const products = [
    { id: "product-285", sku: "707378", product: "Odd Society London Dry Gin" },
    { id: "product-285", sku: "90685", product: "Odd Society Prospector Rye Whisky 375 ml" },
  ];

  assert.equal(findProductIndex(products, { sku: "90685", id: "product-285" }), 1);
});

test("keeps ID fallback behavior for older callers", () => {
  const products = [
    { id: "product-1", sku: "704709", product: "Product One" },
  ];

  assert.equal(findProductIndex(products, { id: "product-1" }), 0);
  assert.equal(findProductIndex(products, { sku: "missing", id: "product-1" }), 0);
});