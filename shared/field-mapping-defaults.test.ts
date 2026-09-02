import assert from "node:assert/strict";
import test from "node:test";
import {
  findRibbonField,
  getOptionalFieldDefaults,
} from "./field-mapping-defaults";

test("defaults Ribbon to the matching ribbon header", () => {
  assert.equal(findRibbonField(["Product", "ribbon", "Notes"]), "ribbon");
  assert.equal(findRibbonField(["Product", "Ribbon"]), "Ribbon");
});

test("leaves Ribbon blank when the CSV has no ribbon header", () => {
  assert.deepEqual(
    getOptionalFieldDefaults(["Product", "SKU", "Notes"]),
    { ribbon: "", notes: "" },
  );
});

test("does not carry the default Ribbon value into a CSV without that header", () => {
  assert.equal(findRibbonField(["Product", "SKU"], "ribbon"), "");
});

test("returns the actual header spelling for the built-in Ribbon default", () => {
  assert.equal(findRibbonField(["Product", "Ribbon"], "ribbon"), "Ribbon");
  assert.deepEqual(
    getOptionalFieldDefaults(["Product", "Ribbon"], { ribbon: "ribbon" }),
    { ribbon: "Ribbon", notes: "" },
  );
});

test("keeps explicit saved optional mappings", () => {
  assert.deepEqual(
    getOptionalFieldDefaults(["Product", "ribbon", "Notes"], {
      ribbon: "Badge",
      notes: "Description",
    }),
    { ribbon: "Badge", notes: "Description" },
  );
});

test("does not auto-select Notes", () => {
  assert.deepEqual(
    getOptionalFieldDefaults(["Product", "ribbon", "Notes"]),
    { ribbon: "ribbon", notes: "" },
  );
});