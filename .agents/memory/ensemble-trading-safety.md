---
name: Multi-model ensemble safety for real-money signals
description: Rules for combining multiple LLM votes into trade decisions safely
---

The auto-trader combines Claude + GPT + Gemini votes.

**Rule:** an executable BUY signal must require a quorum of ≥2 models agreeing; ties and single-model responses resolve to hold. SELLS are asymmetric by user request: when the bot already holds the position (protectiveSell flag), one sell vote suffices and the confidence gate is bypassed — selling reduces risk. Sells on positions the bot does not hold keep the full quorum + confidence rules so a stray vote can't dump the user's own manual holdings. Provider SDK clients must be imported lazily inside the per-model call so a missing integration env var becomes a skipped vote, not a server-startup crash.

**Why:** architect review found a single surviving model could trigger real-money trades, and eagerly-imported integration clients throw at module load when env vars are absent, taking down all trading endpoints.

**How to apply:** any new model added to the ensemble goes through `combineVotes` (pure, unit-tested for 3/3, 2/3, 1/3, tie, all-fail matrices) and uses dynamic `await import()` for its SDK.
