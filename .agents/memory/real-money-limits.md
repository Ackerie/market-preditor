---
name: Real-money spend limits
description: Safety pattern for mirroring auto-trades to real broker accounts
---
Rule: any code path that places real-money orders must (1) be behind authentication — the auto-trade run/run-stream endpoints were originally public and could trigger real orders for all opted-in users; (2) reserve the daily budget atomically BEFORE calling the broker, using a single guarded `UPDATE ... SET spent = effective_spent + n WHERE effective_spent + n <= daily_limit ... RETURNING`, and refund on order rejection; (3) serialize trading cycles with a lock.

**Why:** Architect review flagged both as severe — read-then-write spend tracking loses updates under concurrent cycles (limit bypass), and unauthenticated triggers are direct unauthorized-trading risk.

**How to apply:** Whenever extending real-order paths (new order types, auto-trader changes), keep the reserve-then-order-then-refund pattern and auth gates. Sells additionally check the position exists and cap notional at position value.

Day-trading net-spend model (explicit user policy): the daily limit gates BUYS only. Sells bypass the precheck and reservation entirely, and an executed sell refunds today's spend via a single SQL `GREATEST(spent - notional, 0)` expression (not read-modify-write) so the allotment can be re-deployed intraday. Refund applies to any executed sell (including manual-position exits) — a deliberate policy choice.
