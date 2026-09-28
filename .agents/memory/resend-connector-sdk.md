---
name: Resend via connectors SDK
description: New Replit connections don't expose raw secrets via the v2 connection endpoint; use @replit/connectors-sdk proxy instead
---
Newer Replit connector connections (e.g. Resend) return zero items from `https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?include_secrets=true` — raw API keys are no longer served.

**Why:** The platform moved to a credential-injecting proxy model. Requests must go through `new ReplitConnectors().proxy("<connector>", "/path", opts)` from `@replit/connectors-sdk`, which handles identity, refresh, and auth headers.

**How to apply:** Never fetch settings/api_key manually for these connections; construct `ReplitConnectors` fresh per call (no caching) and call `.proxy()`. Response is fetch-like (status/ok/json/text).

Also: with no verified Resend domain, `onboarding@resend.dev` can only deliver to the Resend account owner's own email (Resend returns 403 for other recipients).
