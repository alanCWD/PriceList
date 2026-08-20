import assert from "node:assert/strict";
import test from "node:test";
import {
  sortProductsByBrandRegistryOrder,
  sortProductsBySavedSkuOrder,
} from "./product-ordering";

const product = (
  id: string,
  sku: string,
  name: string,
  collectionType?: string,
) => ({ id, sku, product: name, collectionType });

test("keeps saved SKU order when an import changes row order or product name", () => {
  const savedOrder = ["SKU-B", "SKU-A", "SKU-C"];
  const firstImport = [
    product("old-a", "SKU-A", "Alpha"),
    product("old-b", "SKU-B", "Beta"),
    product("old-c", "SKU-C", "Charlie"),
  ];
  const reorderedImport = [
    product("old-c", "SKU-C", "Charlie"),
    product("old-a", "SKU-A", "Alpha renamed by Wix"),
    product("old-b", "SKU-B", "Beta"),
  ];

  assert.deepEqual(
    sortProductsBySavedSkuOrder(firstImport, savedOrder).map((item) => item.sku),
    ["SKU-B", "SKU-A", "SKU-C"],
  );
  assert.deepEqual(
    sortProductsBySavedSkuOrder(reorderedImport, savedOrder).map((item) => item.sku),
    ["SKU-B", "SKU-A", "SKU-C"],
  );
});

test("appends new products predictably and ignores stale saved SKUs", () => {
  const products = [
    product("1", "NEW-RED", "Zed Red", "red"),
    product("2", "SAVED", "Renamed Saved Product", "red"),
    product("3", "NEW-WHITE", "Alpha White", "white"),
  ];

  assert.deepEqual(
    sortProductsBySavedSkuOrder(products, ["SAVED", "STALE-SKU"]).map((item) => item.sku),
    ["SAVED", "NEW-WHITE", "NEW-RED"],
  );
});

test("does not apply one saved position to duplicate or blank SKUs", () => {
  const products = [
    product("a", "DUP", "Zulu"),
    product("b", "DUP", "Alpha"),
    product("c", "", "Blank SKU"),
    product("d", "SAVED", "Saved"),
  ];

  assert.deepEqual(
    sortProductsBySavedSkuOrder(products, ["DUP", "SAVED"]).map((item) => item.id),
    ["d", "b", "c", "a"],
  );
});

test("applies the appropriate saved sequence to each brand group", () => {
  const result = sortProductsByBrandRegistryOrder(
    {
      "Brand One": [
        product("one-a", "ONE-A", "A"),
        product("one-b", "ONE-B", "B"),
      ],
      "Brand Two": [
        product("two-a", "TWO-A", "A"),
        product("two-b", "TWO-B", "B"),
      ],
    },
    [
      { brandName: "Brand One", productOrder: ["ONE-B", "ONE-A"] },
      { brandName: "Brand Two", productOrder: ["TWO-A", "TWO-B"] },
    ],
  );

  assert.deepEqual(result["Brand One"].map((item) => item.sku), ["ONE-B", "ONE-A"]);
  assert.deepEqual(result["Brand Two"].map((item) => item.sku), ["TWO-A", "TWO-B"]);
});