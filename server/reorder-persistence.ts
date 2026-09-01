import { sql, type SQL } from "drizzle-orm";
import type { Pricelist } from "@shared/schema";

export interface BrandOrderUpdate {
  brandId: number;
  productOrder: string[];
}

function toTextArray(values: string[]): SQL {
  return values.length > 0
    ? sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`
    : sql`ARRAY[]::text[]`;
}

/**
 * Builds one atomic PostgreSQL statement for Neon HTTP.
 *
 * Drizzle's neon-http driver does not support interactive transactions, but
 * PostgreSQL still executes a single statement atomically. The final guard
 * intentionally raises a division-by-zero error if any expected row was not
 * updated, rolling back every data-modifying CTE in the statement.
 */
export function buildAtomicReorderStatement(
  pricelistId: number,
  products: Pricelist["products"],
  brandOrders: BrandOrderUpdate[],
  updatedAt: Date,
): SQL {
  const brandUpdateRows = brandOrders.length > 0
    ? sql`VALUES ${sql.join(
        brandOrders.map(({ brandId, productOrder }) =>
          sql`(${brandId}::integer, ${toTextArray(productOrder)})`
        ),
        sql`, `,
      )}`
    : sql`SELECT NULL::integer, NULL::text[] WHERE FALSE`;

  return sql`
    WITH brand_updates(brand_id, product_order) AS (
      ${brandUpdateRows}
    ),
    updated_brands AS (
      UPDATE brand_registry AS brand
      SET
        product_order = update_row.product_order,
        updated_at = ${updatedAt}
      FROM brand_updates AS update_row
      WHERE brand.id = update_row.brand_id
      RETURNING brand.id
    ),
    updated_pricelist AS (
      UPDATE pricelists
      SET
        products = ${JSON.stringify(products)}::jsonb,
        updated_at = ${updatedAt}
      WHERE id = ${pricelistId}
      RETURNING id
    )
    SELECT
      (SELECT COUNT(*) FROM updated_brands) AS updated_brand_count,
      (SELECT COUNT(*) FROM updated_pricelist) AS updated_pricelist_count,
      1 / CASE
        WHEN (SELECT COUNT(*) FROM updated_brands) = ${brandOrders.length}
          AND (SELECT COUNT(*) FROM updated_pricelist) = 1
        THEN 1
        ELSE 0
      END AS write_guard
  `;
}