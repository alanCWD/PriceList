---
name: Brand order repair source
description: Defines the approved source of truth when a saved Brand Registry producer order must be repaired.
---

When a producer's saved Brand Registry order is corrupt or incomplete, rebuild its current SKU sequence from the latest pricelist row order.

**Why:** The user explicitly selected the current CSV/pricelist row order as the intended recovery source; automatic wine type/name sorting would guess a different sequence.

**How to apply:** Use this only for deliberate order repair. Normal imports and reorders should continue preserving an existing valid manual SKU sequence.