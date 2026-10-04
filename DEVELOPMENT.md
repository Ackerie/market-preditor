# NexusTrade Development Guide

This guide is for day-to-day development in VS Code. For first-time machine setup, see [SETUP.md](SETUP.md). For product behavior and extension ideas, see [GUIDE.md](GUIDE.md).

## Project Overview

NexusTrade is a pnpm monorepo with a React frontend, an Express API, PostgreSQL persistence, broker adapters, and provider-native AI clients.

```text
artifacts/crypto-trader/   React + Vite frontend
artifacts/api-server/      Express API and broker execution
lib/api-spec/              OpenAPI source of truth
lib/api-client-react/      Generated frontend API hooks
lib/api-zod/               Generated server validation schemas
lib/db/                    Drizzle schema and database client
lib/auth-web/              Shared browser authentication hook
lib/integrations-*/        Anthropic, OpenAI, and Gemini clients
scripts/                   Repository utility scripts
```

Orders are real broker orders when a user enables a live broker connection. The application does not provide a paper portfolio. Use Alpaca paper mode or OANDA practice mode while developing trading changes.

## Run The App

### 1. Install dependencies

From the repository root:

```bash
pnpm install
```

### 2. Configure environment files

Create `artifacts/api-server/.env` with at least:

```dotenv
PORT=8080
BASE_PATH=/api
APP_URL=http://localhost:5173
# Optional comma-separated additional trusted frontend origins
# CORS_ORIGINS=https://app.example.com,https://admin.example.com
DATABASE_URL=postgresql://postgres:YOUR_REAL_POSTGRES_PASSWORD@localhost:5432/nexustrade
SESSION_SECRET=replace-with-a-long-stable-secret

ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
OPENAI_API_KEY=your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1
GEMINI_API_KEY=your-gemini-key
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
# Optional per-user daily AI request limit (default: 500 per provider)
# AI_DAILY_REQUEST_LIMIT=500

# Optional local-only escape hatch. Leave unset for real-money safety.
# ALLOW_SIMULATED_TRADING_DATA=true

# Required for password-reset and alert email delivery
RESEND_API_KEY=your-resend-key
ALERT_FROM_EMAIL="NexusTrade Alerts <alerts@your-verified-domain.com>"
```

Create `artifacts/crypto-trader/.env` if you want to override the frontend defaults:

```dotenv
PORT=5173
BASE_PATH=/
```

Never commit either `.env` file. Keep `SESSION_SECRET` stable because it encrypts stored broker and AI credentials. The API encrypts legacy plaintext credential rows before it starts listening; run `pnpm --filter @workspace/api-server run build` followed by `pnpm --filter @workspace/api-server run migrate-credentials` to run that migration manually.

### 3. Prepare PostgreSQL

Create a local database named `nexustrade`, then apply the schema:

```bash
pnpm --filter @workspace/db run push
```

### 4. Build shared libraries

Run this after a fresh clone and after API contract changes:

```bash
pnpm run typecheck:libs
```

### 5. Start the two services

Use two terminals:

```bash
pnpm --filter @workspace/api-server run dev
```

```bash
pnpm --filter @workspace/crypto-trader run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` requests to the API at `http://localhost:8080`.

On Windows PowerShell, temporary overrides use this form:

```powershell
$env:PORT="8080"; $env:BASE_PATH="/api"; pnpm --filter @workspace/api-server run dev
$env:PORT="5173"; $env:BASE_PATH="/"; pnpm --filter @workspace/crypto-trader run dev
```

## Validation Commands

Run the focused API tests:

```bash
pnpm --filter @workspace/api-server run test
```

Run all available typechecks:

```bash
pnpm run typecheck
```

Build every package:

```bash
pnpm run build
```

If generated declarations are stale, run `pnpm run typecheck:libs` first. Do not edit generated files by hand unless the repository instructions explicitly require it.

## Important Files

### Frontend

- `artifacts/crypto-trader/src/App.tsx`: top-level routes, authentication guard, and page layout wiring.
- `artifacts/crypto-trader/src/components/layout.tsx`: authenticated application shell and navigation.
- `artifacts/crypto-trader/src/pages/`: dashboard, trade, portfolio, history, predictions, watchlist, account, and auto-trade screens.
- `artifacts/crypto-trader/src/components/`: reusable UI and feature components.
- `artifacts/crypto-trader/src/hooks/`: frontend data and interaction hooks.
- `artifacts/crypto-trader/src/lib/`: frontend helpers and query utilities.
- `artifacts/crypto-trader/src/index.css`: global styles and theme variables.
- `artifacts/crypto-trader/vite.config.ts`: Vite server, `/api` proxy, aliases, and build output.

### API routes

All route registration starts at `artifacts/api-server/src/routes/index.ts`.

- `auth.ts`: registration, login, logout, sessions, and password reset.
- `account.ts`: user profile and notification preferences.
- `broker.ts`: Alpaca and OANDA connection management and account summaries.
- `trades.ts`: authenticated manual order execution.
- `portfolio.ts`: combined live broker positions.
- `market.ts`: market summaries and instrument data.
- `coins.ts`: authenticated broker-backed market quotes and instrument definitions.
- `predictions.ts`: Claude-powered per-instrument predictions.
- `autoTrade.ts`: scheduled and manual long-term/day-trade cycles.
- `watchlist.ts`: authenticated watchlist operations.
- `health.ts`: health-check endpoint.

### Broker and trading logic

- `artifacts/api-server/src/lib/brokers/types.ts`: broker adapter contract.
- `artifacts/api-server/src/lib/brokers/registry.ts`: registered adapter lookup.
- `artifacts/api-server/src/lib/brokers/alpacaAdapter.ts`: Alpaca implementation, including stock and crypto quotes.
- `artifacts/api-server/src/lib/brokers/oandaAdapter.ts`: OANDA implementation, including forex, commodity, and CFD quotes.
- `artifacts/api-server/src/lib/brokers/index.ts`: adapter registration.
- `artifacts/api-server/src/lib/brokerRouting.ts`: instrument-to-broker routing.
- `artifacts/api-server/src/lib/realAutoTrade.ts`: capped real-order execution and budget guards.
- `artifacts/api-server/src/lib/dayTradeGuards.ts`: day-trade take-profit and stop-loss guards.
- `artifacts/api-server/src/lib/aiEnsemble.ts`: Claude, GPT, and Gemini vote combination.
- `artifacts/api-server/src/lib/tradeRisk.ts`: deterministic risk arbiter that can reject AI-approved entries.
- `artifacts/api-server/src/lib/credentialCrypto.ts`: encryption for stored broker credentials.
- `artifacts/api-server/src/lib/resendMail.ts`: direct Resend email delivery.

### Database

- `lib/db/src/index.ts`: Drizzle database client and connection pool.
- `lib/db/src/schema/`: PostgreSQL table definitions, including per-user auto-trade settings, AI usage, idempotent order requests, and distributed cycle leases.
- `lib/db/drizzle.config.ts`: Drizzle configuration.
- `artifacts/api-server/src/lib/autoTradePnl.ts`: realized auto-trade P&L calculations.

### API contracts and generated code

- `lib/api-spec/openapi.yaml`: source of truth for API paths, request bodies, and responses.
- `lib/api-spec/orval.config.ts`: Orval generation configuration.
- `lib/api-client-react/src/generated/`: generated React Query hooks.
- `lib/api-zod/src/generated/`: generated server-side Zod schemas.

When changing an endpoint:

1. Edit `lib/api-spec/openapi.yaml`.
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Rebuild declarations with `pnpm run typecheck:libs`.
4. Update the route implementation and frontend usage.
5. Run API tests and typecheck.

Do not edit `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` as the primary source of a contract change.

### Authentication and AI providers

- `lib/auth-web/src/use-auth.ts`: browser auth state and login/register/logout calls.
- `artifacts/api-server/src/lib/auth.ts`: server session and password helpers.
- `lib/integrations-anthropic-ai/`: Anthropic SDK client.
- `lib/integrations-openai-ai-server/`: OpenAI client and media helpers.
- `lib/integrations-gemini-ai/`: Gemini client and image helper.

Provider credentials are read from `ANTHROPIC_*`, `OPENAI_*`, and `GEMINI_*` environment variables. Missing ensemble providers are skipped, but buy/sell decisions require the configured quorum.

The trading decision pipeline now gives each model a distinct responsibility: Claude acts as the portfolio strategist, GPT as the quantitative technical analyst, and Gemini as the skeptical risk reviewer. Each response must include signal, confidence, entry quality, risk/reward, stop-loss, take-profit, market regime, and risk flags. The ensemble aggregates those fields, then `tradeRisk.ts` applies deterministic minimums before an order can be submitted. The risk arbiter is the final authority; model consensus cannot bypass it.

The auto-trade cycle now requests broker-native bars through `BrokerAdapter.getMarketBars()`: Alpaca provides stock/crypto bars and OANDA provides instrument candles. Day trade uses 5-minute bars; long-term analysis uses 1-hour bars. If no opted-in account is available or the provider request fails, the cycle falls back to simulated candles and blocks new entries unless `ALLOW_SIMULATED_TRADING_DATA=true` is explicitly set for local development. Protective exits remain available.

## Safe Editing Workflow

1. Identify the owning route, component, adapter, or schema before editing.
2. Make the smallest change in the owning file.
3. Add or update a focused test beside the changed API logic.
4. Run the narrow test first, then `pnpm run typecheck:libs` and the broader checks.
5. For changes involving real orders, test with paper/practice broker credentials and verify caps, auth gating, and rejection handling.
6. Update [SETUP.md](SETUP.md) and [GUIDE.md](GUIDE.md) when configuration or behavior changes.

## Common Troubleshooting

- **Frontend cannot reach API:** confirm the API is on port `8080` and the frontend is on port `5173`.
- **Database connection fails:** verify PostgreSQL is running and `DATABASE_URL` points to the correct database.
- **Login or registration returns HTTP 500:** this is usually a database connection failure, not an invalid app password. Replace `YOUR_REAL_POSTGRES_PASSWORD` in `artifacts/api-server/.env` with the password configured for the local PostgreSQL `postgres` role, then restart the API. The database must contain the schema from `pnpm --filter @workspace/db run push`.
- **AI calls fail:** check the provider-native environment variable names and API keys.
- **Password reset does not send:** verify `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `APP_URL`, and the sender domain.
- **Stored broker credentials cannot decrypt:** restore the original `SESSION_SECRET` or reconnect the brokers.
- **Generated imports fail:** run API codegen, then `pnpm run typecheck:libs`.
- **Tests fail after a trading change:** inspect broker routing, order caps, cash checks, wash-trade guards, and day-trade exit guards before changing shared abstractions.
