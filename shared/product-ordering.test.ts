import assert from "node:assert/strict";
import test from "node:test";
import {
  sortFlatProductsByBrandRegistryOrder,
  sortProductsByBrandRegistryOrder,
  sortProductsBySavedSkuOrder,
} from "./product-ordering";
import { reconcileProductIdsBySku } from "./product-reconciliation";

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

test("keeps manual brand order through a differently ordered import", () => {
  const existingProducts = [
    product("stable-b2", "B-2", "Brand B Two"),
    product("stable-b1", "B-1", "Brand B One"),
    product("stable-a2", "A-2", "Brand A Two"),
    product("stable-a1", "A-1", "Brand A One"),
  ];
  const importedProducts = [
    product("row-a1", "A-1", "Brand A One Renamed"),
    product("row-b1", "B-1", "Brand B One"),
    product("row-b3", "B-3", "Brand B New"),
    product("row-unassigned", "OTHER", "Unassigned"),
    product("row-b2", "B-2", "Brand B Two"),
    product("row-a2", "A-2", "Brand A Two"),
    product("row-blank", "", "Blank SKU"),
  ];
  const reconciled = reconcileProductIdsBySku(
    existingProducts,
    importedProducts,
  ).products;

  const ordered = sortFlatProductsByBrandRegistryOrder(reconciled, [
    {
      brandName: "Brand A",
      skus: ["A-1", "A-2"],
      productOrder: ["A-2", "A-1"],
    },
    {
      brandName: "Brand B",
      skus: ["B-1", "B-2", "B-3"],
      productOrder: ["B-2", "B-1"],
    },
  ]);

  assert.deepEqual(
    ordered.filter((item) => item.sku.startsWith("A-")).map((item) => item.sku),
    ["A-2", "A-1"],
  );
  assert.deepEqual(
    ordered.filter((item) => item.sku.startsWith("B-")).map((item) => item.sku),
    ["B-2", "B-1", "B-3"],
  );
  assert.equal(ordered.find((item) => item.sku === "A-1")?.id, "stable-a1");
  assert.equal(
    ordered.find((item) => item.sku === "A-1")?.product,
    "Brand A One Renamed",
  );
  assert.equal(ordered[3].sku, "OTHER");
  assert.equal(ordered[6].sku, "");
});

test("ignores removed saved SKUs while leaving unassigned products in place", () => {
  const ordered = sortFlatProductsByBrandRegistryOrder(
    [
      product("unassigned", "OTHER", "Unassigned"),
      product("a", "A", "Alpha"),
      product("blank", "", "Blank"),
    ],
    [{
      brandName: "Brand",
      skus: ["A"],
      productOrder: ["REMOVED", "A"],
    }],
  );

  assert.deepEqual(ordered.map((item) => item.id), ["unassigned", "a", "blank"]);
});
