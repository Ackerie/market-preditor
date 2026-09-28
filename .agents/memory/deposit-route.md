---
name: deposit route pattern
description: How the paper trading deposit endpoint updates the portfolio balance
---

The deposit endpoint at `POST /api/account/deposit` adds funds to the portfolio using raw SQL:
```ts
await db.execute(
  sql`UPDATE portfolio SET usd_balance = usd_balance + ${amountUsd} WHERE id = (SELECT id FROM portfolio LIMIT 1)`
);
```

**Why:** Drizzle ORM doesn't support `col = col + value` increment syntax naturally. Using `db.update().set({ usdBalance: ... })` requires a SELECT first. Raw SQL increment is atomic and avoids race conditions.

**How to apply:** Use this pattern for any balance increment/decrement operations on the portfolio table. Store deposits in deposit_transactions with amount in cents (integer), convert to dollars in the API response.
