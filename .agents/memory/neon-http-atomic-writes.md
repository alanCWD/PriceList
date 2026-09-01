---
name: Neon HTTP atomic writes
description: How to preserve atomicity for multi-table updates with the project's Neon HTTP database driver.
---

Do not use Drizzle's interactive `db.transaction(...)` API with the Neon HTTP driver. For multi-table writes that must succeed or fail together, issue one PostgreSQL statement using data-modifying CTEs and a guard that raises if expected row counts are not met.

**Why:** The Neon HTTP driver throws `No transactions support in neon-http driver` before an interactive transaction runs. PostgreSQL still guarantees statement-level atomicity, including data-modifying CTEs.

**How to apply:** When a server operation needs atomic multi-table persistence, keep it in one parameterized statement and validate every expected update inside that statement. Do not silently fall back to sequential writes that can leave partial state.