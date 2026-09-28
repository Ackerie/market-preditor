---
name: Broker plug-in framework
description: How new brokers are added and the import rule for the broker registry
---

The api-server has a plug-in broker framework in `lib/brokers/` (BrokerAdapter interface + registry). All broker specifics (routing, budget SQL, order placement, portfolio/history normalization) live in one adapter file per broker; the auto-trader and routes are broker-generic loops.

**Rule:** always import `getBroker`/`listBrokers` from `./brokers` (the index), never from `./brokers/registry` directly.
**Why:** only the index module registers the adapters as a side effect — importing the registry directly yields an empty registry (surfaced as a test failure where broker display names fell back to raw IDs).
**How to apply:** any new consumer of the registry, and any new adapter, goes through `brokers/index.ts`. Adapters must never import `brokerRouting.ts` (cycle). Keep broker IDs ≤10 chars (varchar(10) event columns); OpenAPI `broker` fields are plain strings, not enums, so new brokers don't break codegen.
