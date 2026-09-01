import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildAtomicReorderStatement } from "../server/reorder-persistence";

const dialect = new PgDialect();

test("builds one Neon HTTP-compatible atomic reorder statement", () => {
  const statement = buildAtomicReorderStatement(
    42,
    [{
      id: "product-a",
      sku: "SKU-A",
      product: "Product A",
      format: "750ml",
      price: "10.00",
      category: "1-wine-Brand",
      isHidden: false,
    }],
    [
      { brandId: 7, productOrder: ["SKU-B", "SKU-A"] },
      { brandId: 8, productOrder: ["SKU-C"] },
    ],
    new Date("2026-09-01T00:00:00.000Z"),
  );
  const query = dialect.sqlToQuery(statement);

  assert.match(query.sql.trimStart(), /^with brand_updates/i);
  assert.match(query.sql, /updated_brands/i);
  assert.match(query.sql, /updated_pricelist/i);
  assert.match(query.sql, /write_guard/i);
  assert.match(query.sql, /array\[\$2, \$3\]::text\[\]/i);
  assert.doesNotMatch(query.sql, /\bbegin\b|\bcommit\b/i);
  assert.ok(query.params.includes(42));
  assert.ok(query.params.includes(7));
  assert.ok(query.params.includes(8));
});

test("supports a reorder when there are no registry brand rows to update", () => {
  const statement = buildAtomicReorderStatement(
    42,
    [],
    [],
    new Date("2026-09-01T00:00:00.000Z"),
  );
  const query = dialect.sqlToQuery(statement);

  assert.match(query.sql, /select null::integer, null::text\[\] where false/i);
  assert.match(query.sql, /updated_pricelist/i);
});