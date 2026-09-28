---
name: Broker rejection hardening
description: Pre-check orders instead of letting brokers reject them — precision, wash trades, minimums
---
Rule: never submit an order the broker will predictably reject — pre-check and skip with a reason code instead.
**Why:** rejected auto-trades spam events/alerts and waste cycles; the three big rejection classes seen in prod were OANDA units-precision (sells), Alpaca "potential wash trade" (opposite side within minutes), and Alpaca crypto $10 minimum.
**How to apply:** round OANDA units to the instrument's `tradeUnitsPrecision` (sells floor + REDUCE_ONLY); skip an order when the opposite side of the same symbol executed for the same user within ~2 min (exit-guard sells exempt); expose per-broker minimum notional on the adapter interface and skip buys below it.
