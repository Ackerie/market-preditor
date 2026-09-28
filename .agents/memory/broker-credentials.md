---
name: Broker credential encryption
description: How per-user Alpaca brokerage credentials must be stored and handled
---

Rule: user-supplied brokerage API keys/secrets must be encrypted at rest (AES-256-GCM, key derived from SESSION_SECRET via scrypt, `enc:v1:iv:tag:ct` format) and only decrypted in memory when calling Alpaca. API responses expose a masked key only, never the secret.

**Why:** Architect review failed the feature for plaintext credential storage — DB compromise would expose live trading keys.

**How to apply:** Any new route or feature touching `broker_connections` must go through the encrypt/decrypt helpers (`credentialCrypto.ts`) and never log or return raw credentials. Rotating SESSION_SECRET invalidates stored credentials — users would need to reconnect.
