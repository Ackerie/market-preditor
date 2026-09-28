# NexusTrade — Local Development Setup (VS Code)

A step-by-step guide to get NexusTrade running on your own machine in VS Code.

NexusTrade is a **real-money-only** trading terminal: display prices for its 49 instruments are simulated in-memory, but every order is executed on the user's own broker account — **Alpaca** (stocks & crypto) or **OANDA** (forex, commodities, index CFDs). There is no paper portfolio.

For daily development, important file locations, API contract changes, and editing workflow, see [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Prerequisites

Install these before anything else:

| Tool           | Version    | Download                             |
| -------------- | ---------- | ------------------------------------ |
| **Node.js**    | 24.x (LTS) | https://nodejs.org                   |
| **pnpm**       | 9.x+       | `npm install -g pnpm`                |
| **PostgreSQL** | 15+        | https://www.postgresql.org/download/ |
| **Git**        | any        | https://git-scm.com                  |
| **VS Code**    | latest     | https://code.visualstudio.com        |

Verify they're installed:

```bash
node --version    # should print v24.x.x
pnpm --version    # should print 9.x.x
psql --version    # should print psql 15.x or 16.x
```

---

## Step 1 — Get the code

### Clone via Git

```bash
git clone https://github.com/YOUR_USERNAME/nexustrade.git
cd nexustrade
```

---

## Step 2 — Open in VS Code

```bash
code nexustrade
# or open VS Code, File → Open Folder → select the project folder
```

When prompted, click **"Install Recommended Extensions"** — this installs Tailwind CSS IntelliSense, ESLint, Prettier, and TypeScript tools automatically. (They're listed in `.vscode/extensions.json`.)

---

## Step 3 — Install dependencies

Open the VS Code integrated terminal (`Ctrl+`` ` or **Terminal → New Terminal**) and run:

```bash
pnpm install
```

This installs packages for all workspace packages at once. It will take a minute the first time.

---

## Step 4 — Set up PostgreSQL

### Create the database

```bash
# Start PostgreSQL (macOS with Homebrew)
brew services start postgresql@15

# Or on Linux
sudo systemctl start postgresql

# Create the database
psql -U postgres -c "CREATE DATABASE nexustrade;"
```

Your connection string will be:

```
postgresql://postgres:YOUR_PASSWORD@localhost:5432/nexustrade
```

> **Windows**: Use [pgAdmin](https://www.pgadmin.org/) to create a database named `nexustrade`, or run the psql command in the PostgreSQL Shell that comes with the installer.

---

## Step 5 — Create environment files

The project has two services, each needing its own env file.

### API server — create `artifacts/api-server/.env`

```bash
PORT=8080
BASE_PATH=/api
APP_URL=http://localhost:5173

DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/nexustrade
# Get an API key at: https://console.anthropic.com
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE

# Auto-trade signals use a 3-model ensemble (Claude + GPT + Gemini).
# Missing providers are skipped gracefully (their vote is dropped), so these
# are optional — but with only Claude configured, the 2-model buy/sell quorum
# can never be met and the bot will always hold.
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-YOUR_OPENAI_KEY
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_API_KEY=YOUR_GEMINI_KEY

SESSION_SECRET=any-long-random-string-you-make-up

# Optional
# ALERT_FROM_EMAIL="NexusTrade Alerts <alerts@yourdomain.com>"  # verified Resend sender for auto-trade email alerts
# LOG_LEVEL=debug
```

> **How the API server reads this file**: the `start` script uses Node's `--env-file=.env` option. The API `dev` script builds the bundle and starts the server. Run the database push separately during setup. Do not commit this file.

> **SESSION_SECRET matters more than it looks**: it derives the AES-256-GCM encryption key for stored broker credentials — both Alpaca API keys and OANDA tokens (`artifacts/api-server/src/lib/credentialCrypto.ts`). If you change it, every user's saved broker connection becomes unreadable and they must reconnect. Pick one value and keep it stable.

> **Authentication**: users register and sign in with their own email and password, including a required password confirmation during signup. Passwords are stored as salted `scrypt` hashes in the PostgreSQL `users.password_hash` column; the browser receives only an HTTP-only session cookie. The login screen includes a forgot-password flow that sends a one-hour reset link through Resend.

> **Email alerts and password reset**: email delivery uses Resend's HTTPS API. Set `RESEND_API_KEY`, `ALERT_FROM_EMAIL` to a verified sender, and `APP_URL` to the frontend's public URL so password reset links open the correct site. The reset endpoint still returns a generic response so it does not reveal whether an email exists.

> **Trading bot safety**: the bot uses three role-based AI analysts plus a deterministic risk arbiter. It requests broker-native bars for connected opted-in accounts and blocks new entries when it must fall back to simulated data. Use Alpaca paper mode or OANDA practice mode while developing trading changes.

### Frontend — create `artifacts/crypto-trader/.env`

```bash
PORT=5173
BASE_PATH=/
```

If you do not define these values, Vite will fall back to `PORT=5173` and `BASE_PATH=/` for local development/builds.

> **Important**: Never commit `.env` files to Git. They are already in `.gitignore`.

---

## Step 6 — Push the database schema

This creates all the required tables in your local PostgreSQL. Run it explicitly before starting the API so database errors are visible immediately:

```bash
pnpm --filter @workspace/db run push
```

You should see: `[✓] Changes applied`

Tables created (from `lib/db/src/schema/`): users, sessions, and password_reset_tokens (auth), broker_connections (Alpaca), oanda_connections, auto_trade settings, auto_trade_events, auto_trade_notifications, watchlist, user profile.

If upgrading an existing database, this command adds `users.password_hash`. Existing records without a local password need an explicit account migration or password reset before those users can sign in.

---

## Step 7 — Build shared libraries

The frontend and API server depend on generated code in `lib/`. Build it once:

```bash
pnpm run typecheck:libs
```

---

## Step 8 — Start the app

### Using VS Code tasks (easiest)

Press `Ctrl+Shift+B` (or **Terminal → Run Build Task**) and select **"Start Both Servers"**. This opens two terminal panels — one for the API server, one for the frontend.

### Manually (two terminals)

**Terminal 1 — API server:**

```bash
pnpm --filter @workspace/api-server run dev
```

Wait for: `Server listening — port: 8080`

**Terminal 2 — Frontend:**

```bash
pnpm --filter @workspace/crypto-trader run dev
```

On Windows PowerShell, the same commands work because both `.env` files already define `PORT` and `BASE_PATH`. If you need to override them for one session, use `$env:PORT="8080"` and `$env:BASE_PATH="/api"` before starting the API, or `$env:PORT="5173"` and `$env:BASE_PATH="/"` before starting the frontend.

Wait for: `VITE ready in ...ms` and note the exact local URL shown in the terminal.

### Open the app

Go to the local URL printed by Vite, for example **http://localhost:5173/** or **http://localhost:5174/** if port `5173` is already in use.

> The frontend calls the API at `/api/...`. The Vite development server now proxies those requests to `http://localhost:8080`, so no separate CORS configuration is needed for local development.

---

## Step 9 — Run the tests

```bash
pnpm --filter @workspace/api-server run test
```

Covers broker routing, auto-trade budget/cap logic, day-trade exit guards, OANDA tradeability caching, ensemble vote combining, and 401 auth gating (118 tests). All tests run against in-memory logic — no broker credentials needed.

---

## Daily development workflow

### Editing the frontend (React components, pages, styles)

Files live in `artifacts/crypto-trader/src/`. Vite hot-reloads instantly — just save the file and see changes in the browser.

### Editing API routes

Files live in `artifacts/api-server/src/routes/`. The dev server rebuilds and restarts automatically on save.

### Adding a new API endpoint

1. **Edit the OpenAPI spec** — `lib/api-spec/openapi.yaml` (this is the source of truth)
2. **Run codegen** to regenerate hooks and Zod schemas:
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```
3. **Fix the api-zod barrel export** — open `lib/api-zod/src/index.ts` and make sure it contains exactly these two lines:
   ```ts
   export * from "./generated/api";
   export * from "./types";
   ```
   (Orval overwrites this file each run — always reset it after codegen. The second line re-exports hand-written types like `AuthUser`.)
4. **Add the route handler** in `artifacts/api-server/src/routes/`
5. **Use the generated hook** in a React component — the hook is already available via `@workspace/api-client-react`

### Checking for type errors

```bash
pnpm run typecheck
```

Run `pnpm run typecheck:libs` first if you changed anything inside `lib/`.

---

## VS Code tasks reference

Open the task runner with `Ctrl+Shift+P` → **"Tasks: Run Task"**:

| Task                   | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| **Start Both Servers** | Starts API + frontend together (default build task)               |
| **Start API Server**   | API server only on port 8080                                      |
| **Start Frontend**     | Frontend only on port 5173                                        |
| **Push DB schema**     | Applies schema changes to your local database                     |
| **Run codegen**        | Regenerates React Query hooks and Zod schemas from `openapi.yaml` |
| **Typecheck (full)**   | Full TypeScript check across all packages                         |
| **Run API tests**      | Runs the api-server unit test suite                               |

---

## Recommended VS Code extensions

These are auto-suggested when you open the project (`.vscode/extensions.json`):

- **Tailwind CSS IntelliSense** — autocomplete for Tailwind classes
- **ESLint** — inline linting
- **Prettier** — auto-format on save
- **TypeScript Next** — latest TS language features
- **SQLTools + PostgreSQL driver** — run SQL queries inside VS Code

---

## Local API proxy

The Vite config forwards `/api/*` from the frontend to `http://localhost:8080`. If you change the API port, updatein `artifacts/crypto-trader/vite.config.ts` to match.

---

## Project structure overview

```
nexustrade/
├── artifacts/
│   ├── api-server/          ← Express 5 API (port 8080)
│   │   └── src/
│   │       ├── routes/      ← coins, trades, portfolio, predictions,
│   │       │                  market, watchlist, broker, account, autoTrade
│   │       └── lib/         ← brokers/ (plug-in broker adapters + registry),
│   │                          brokerRouting.ts (instrument → broker routing),
│   │                          oanda.ts (OANDA v20 client), coins.ts (simulated
│   │                          prices), realAutoTrade.ts (real-money bot),
│   │                          credentialCrypto.ts, resendMail.ts, autoTradeNotify.ts
│   └── crypto-trader/       ← React + Vite frontend (port 5173)
│       └── src/
│           ├── pages/       ← Dashboard, Trade, Portfolio, History, Predictions,
│           │                  Watchlist, Auto-Trade, Real Money, Account…
│           └── components/  ← layout.tsx (responsive sidebar/drawer nav)
├── lib/
│   ├── api-spec/            ← openapi.yaml (source of truth)
│   ├── api-client-react/    ← Generated React Query hooks (don't edit)
│   ├── api-zod/             ← Generated Zod schemas (don't edit)
│   └── db/                  ← Drizzle ORM schema
│       └── src/schema/      ← auth, broker (Alpaca), oanda, autoTrade,
│                              autoTradeEvents, notifications, watchlist, userProfile
└── .vscode/                 ← Tasks, settings, extension recommendations
```

---

## Common problems

| Problem                                                | Fix                                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT is required` error                               | Make sure `artifacts/api-server/.env` exists with `PORT=8080`; the frontend `.env` should contain `PORT=5173`                             |
| `DATABASE_URL` error                                   | Check your PostgreSQL is running and the URL is correct                                                                                   |
| Tables don't exist                                     | Run `pnpm --filter @workspace/db run push`                                                                                                |
| TS errors after pulling new code                       | Run `pnpm run typecheck:libs` to rebuild lib declarations                                                                                 |
| Codegen broke imports                                  | Reset `lib/api-zod/src/index.ts` to the two-line barrel (see "Adding a new API endpoint")                                                 |
| AI predictions not working                             | Add your Anthropic API key to `artifacts/api-server/.env`                                                                                 |
| Login does not work                                    | Confirm the API is running, the Vite `/api` proxy targets port 8080, and the database schema push completed                               |
| Forgot-password email does not arrive                  | Configure `RESEND_API_KEY` and a verified `ALERT_FROM_EMAIL`; the API intentionally returns a generic success message for unknown emails  |
| Broker connections broken after env change             | You changed `SESSION_SECRET` — stored credentials can't be decrypted; reconnect in Account → Connections                                  |
| Email alerts do nothing locally                        | Configure `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, and `APP_URL` in the API environment                                                      |
| Portfolio/History pages empty                          | They show live broker data — connect Alpaca and/or OANDA in Account → Connections first                                                   |
| Auto-trader always holds, never buys/sells             | Buy/sell needs a 2-model quorum — configure the OpenAI and Gemini env vars too, not just Anthropic                                        |
| BNB never trades                                       | Intentional — Alpaca doesn't offer BNB, so it's unroutable and skipped                                                                    |
| Commodity/index CFD orders rejected by OANDA           | Your OANDA account/region doesn't offer that instrument — the app remembers this for 6h and skips it in later cycles                      |
| OANDA "units … more precision than allowed" rejections | Fixed — units are now rounded to each instrument's OANDA precision (whole units for currency pairs); sells round down and are reduce-only |
| Alpaca "potential wash trade detected" rejections      | Fixed — the bot skips an order when the opposite side of the same symbol executed within the last 2 minutes (`wash_trade` skip event)     |
| Alpaca "cost basis must be >= 10" rejections           | Fixed — crypto buys below Alpaca's $10 minimum are skipped (`too_small`) instead of submitted                                             |

---

## Real-money trading — local notes

All trading is real money on the user's own broker accounts. Nothing broker-related goes in `.env` — users paste their own credentials in the UI (Account → Connections), which are verified against the broker, then AES-256-GCM encrypted and stored in the database.

- **Alpaca** (stocks & crypto): paper or live; API key + secret. Server: `routes/broker.ts`. Your machine needs outbound access to `paper-api.alpaca.markets` / `api.alpaca.markets`.
- **OANDA** (forex, commodities, index CFDs): practice or live; API token + account ID. Client: `lib/oanda.ts` (practice/live hosts). Outbound access to `api-fxpractice.oanda.com` / `api-fxtrade.oanda.com`.
- **Broker plug-in framework**: `lib/brokers/` holds one adapter per broker (Alpaca, OANDA) implementing a shared `BrokerAdapter` interface; new brokers are added by writing one adapter file and registering it in `lib/brokers/index.ts`. `lib/brokerRouting.ts` routes each of the 49 instruments by asking the adapters in order — the first match wins. Instruments with no route are skipped by the auto-trader. BNB/BNB-PERP are intentionally unroutable (Alpaca has no BNB/USD asset). Instruments OANDA rejects as "not tradeable by the Account" are cached as untradeable for 6h so the bot stops retrying them.
- **Auto-trader** (`lib/realAutoTrade.ts`): per-user opt-in per broker, with a per-trade cap and an atomically enforced daily spend limit. The daily limit gates buys only — executed sells refund today's spend so the same allotment can be re-deployed intraday. Signals come from a 3-model ensemble (`lib/aiEnsemble.ts`). Test with Alpaca **paper** and OANDA **practice** accounts first — live connections place real orders.
- **Two bot strategies**: a long-term Auto-Trade strategy plus an opt-in **Day-Trade Bot** (own toggle and Max Trade Size on the Auto-Trade page). Every executed `auto_trade_events` row is tagged with `strategy` (`longterm`/`daytrade`), so positions, exit guards, and P&L are tracked per strategy. The day-trade bot runs continuously (back-to-back cycles) while the US stock market is open (9:30–16:00 ET weekdays) and every 15 minutes after the close — fully independent of the long-term bot (each strategy has its own cycle lock and the scheduler fires both in parallel when due, so neither can delay or starve the other) — feeds a 5-minute simulated candlestick series into the AI prompt (`GET /auto-trade/candles/{symbol}` serves the same series to the UI's candlestick charts, which are shown for every symbol the day-trade bot has traded with ▲ buy / ▼ sell markers on the candles), and is the only strategy the take-profit/stop-loss exit guards (`lib/dayTradeGuards.ts`) apply to; 30-day realized P&L lives in `lib/autoTradePnl.ts` (`?strategy=` filter).
