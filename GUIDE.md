# NexusTrade — Improvement Guide

A reference doc for customizing, extending, and improving this real-money trading terminal.
Everything here is actionable — file paths, code snippets, and step-by-step instructions.

**What the app is today**: 49 instruments with broker-backed display prices; ALL orders execute on the user's own broker account — Alpaca (stocks & crypto) or OANDA (forex, commodities, index CFDs). Claude-powered predictions; an opt-in real-money auto-trader driven by a 3-model ensemble (Claude + GPT + Gemini, 2-model quorum to trade) with per-trade and daily caps, built-in day-trade take-profit/stop-loss exit guards, a Bot Performance (realized P&L) card, and auto-trade email alerts via Resend. There is no paper portfolio.

Market quotes now come from the same broker adapters used for execution. To add another broker, implement `getMarketQuotes()` on its `BrokerAdapter` alongside routing, connection, order, portfolio, history, and bar support, then register it in `artifacts/api-server/src/lib/brokers/index.ts`. The `/coins` endpoints discover registered brokers automatically.

Authentication is owned by the application: email/password accounts are stored in PostgreSQL, passwords use salted `scrypt` hashes, signup requires password confirmation, and sessions use HTTP-only database-backed cookies. Forgot-password requests create one-hour, one-time hashed reset tokens and send reset links through the Resend API; `APP_URL` controls the frontend URL in those links.

---

## Table of Contents

1. [Swap or Tune the AI Model](#1-swap-or-tune-the-ai-model)
2. [Connect Real Price Data](#2-connect-real-price-data)
3. [Add More Instruments](#3-add-more-instruments)
4. [Improve AI Trade Decisions](#4-improve-ai-trade-decisions)
5. [Stop-Loss & Take-Profit Rules (built in)](#5-stop-loss--take-profit-rules-built-in--how-to-tune)
6. [Alerts: Email (built-in) & Webhooks](#6-alerts-email-built-in--webhooks)
7. [Add Limit Orders](#7-add-limit-orders)
8. [Add News Sentiment Analysis](#8-add-news-sentiment-analysis)
9. [Deploy to Production](#9-deploy-to-production)
10. [Performance Optimizations](#10-performance-optimizations)
11. [Auto-Trader Internals & Safety Rails](#11-auto-trader-internals--safety-rails)

---

## 1. Swap or Tune the AI Model

**Files:** `artifacts/api-server/src/routes/predictions.ts` (per-coin signals, Claude only), `artifacts/api-server/src/lib/aiEnsemble.ts` (auto-trade bot decisions)

Predictions use Claude through the Anthropic API (`ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`). The default endpoint is `https://api.anthropic.com`; use your own API key.

Auto-trading uses a role-based ensemble: Claude reviews portfolio durability and market regime, GPT reviews technical structure and risk/reward, and Gemini acts as a skeptical risk reviewer. Their structured outputs are combined by `artifacts/api-server/src/lib/aiEnsemble.ts`, then `artifacts/api-server/src/lib/tradeRisk.ts` applies deterministic entry-quality, stop-loss, risk/reward, leverage, and data-risk checks. A model consensus cannot override the risk arbiter.

The auto-trade prompt now uses broker-native bars through the adapter interface: Alpaca stock/crypto bars and OANDA instrument candles. Day trade uses 5-minute bars and long-term analysis uses 1-hour bars. If native data is unavailable, simulated candles are used only as a visible fallback and new entries are blocked unless `ALLOW_SIMULATED_TRADING_DATA=true` is explicitly enabled for local development.

**Auto-trade decisions are a 3-model ensemble** (`aiEnsemble.ts`): Claude + GPT + Gemini are queried in parallel with the same prompt; a buy/sell needs ≥2 agreeing models, ties resolve to hold, and failed/unconfigured models are simply skipped (but with fewer than 2 working models the bot can never trade). Model IDs live in `aiEnsemble.ts` — change the model strings there to swap models per provider.

### Switching Claude models (easiest)

```typescript
// Just change the model string where messages.create is called:
model: "claude-haiku-3-5"; // fastest, cheapest — good for frequent cycles
model: "claude-sonnet-4-6"; // current default — balanced
model: "claude-opus-4"; // most powerful — best reasoning, slowest
```

### Option — OpenAI GPT-4o

```bash
pnpm --filter @workspace/api-server add openai
# env: OPENAI_API_KEY=sk-...
```

```typescript
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const res = await openai.chat.completions.create({
  model: "gpt-4o",
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: "Return JSON: {signal, confidence, reasoning}" },
    { role: "user", content: prompt },
  ],
});
const aiResponse = JSON.parse(res.choices[0].message.content!);
```

### Option — Ollama (run a model locally, no API cost)

> Vite-based frontends in this repo are tolerant of missing `PORT`/`BASE_PATH` values during local builds and dev starts; they fall back to `5173` and `/` if you have not set them.

```bash
# pnpm --filter @workspace/api-server run test
ollama pull mistral
ollama serve   # runs at http://localhost:11434
```

```typescript
import OpenAI from "openai";
const ollama = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});
const res = await ollama.chat.completions.create({
  model: "mistral",
  messages: [{ role: "user", content: prompt }],
});
```

> ⚠️ The auto-trader places **real orders**. If you swap the model, test with an Alpaca paper account / OANDA practice account before enabling it on a live connection.

---

## 2. Connect Real Price Data

**File:** `artifacts/api-server/src/lib/coins.ts`

Display prices and AI-signal inputs are simulated with a 10-second in-memory cache. **Execution prices always come from the brokers** — this section only affects what users see and what the AI reasons about.

### CoinGecko for crypto (free tier — no API key)

```typescript
const priceCache: Record<string, { price: number; ts: number }> = {};
const CACHE_TTL = 30_000;

export async function getRealPrice(coinGeckoId: string): Promise<number> {
  const cached = priceCache[coinGeckoId];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.price;

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=usd`,
  );
  const data = await res.json();
  const price = data[coinGeckoId].usd;
  priceCache[coinGeckoId] = { price, ts: Date.now() };
  return price;
}
```

### Broker-native quotes (best accuracy, uses the user's own keys)

- **Alpaca market data**: `https://data.alpaca.markets/v2/stocks/{symbol}/quotes/latest` works with the same API keys users already connect.
- **OANDA pricing**: the v20 client in `artifacts/api-server/src/lib/oanda.ts` can fetch `/v3/accounts/{id}/pricing?instruments=...` — practice and live hosts are already handled there.

### Binance WebSocket (real-time crypto, zero cost)

```typescript
import WebSocket from "ws";
const prices: Record<string, number> = {};

export function startPriceFeed(symbols: string[]) {
  const streams = symbols
    .map((s) => `${s.toLowerCase()}usdt@miniTicker`)
    .join("/");
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/stream?streams=${streams}`,
  );
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.data?.s && msg.data?.c)
      prices[msg.data.s.replace("USDT", "")] = parseFloat(msg.data.c);
  });
}
```

---

## 3. Add More Instruments

Two files must agree:

1. **`artifacts/api-server/src/lib/coins.ts`** — add the instrument to the list (symbol, name, base price, market cap, etc.) so it shows up in the UI and gets simulated prices.
2. **Broker routing** — `brokerRouting.ts` asks each registered broker adapter (`artifacts/api-server/src/lib/brokers/`) in order; the first adapter whose `routeSymbol()` accepts the instrument wins. To route a new instrument, extend the matching adapter's `routeSymbol()` (Alpaca: `brokers/alpacaAdapter.ts`; OANDA: `brokers/oandaAdapter.ts`):
   - stocks & crypto → Alpaca (e.g. `AAPL`, `BTC/USD`)
   - forex / commodities / index CFDs → OANDA (e.g. `EUR_USD`, `XAU_USD`)
   - Instruments with **no route** still display, but the auto-trader skips them and manual trades are rejected. (BNB/BNB-PERP are intentionally unroutable — Alpaca has no BNB/USD asset; the `ALPACA_UNSUPPORTED_CRYPTO` set in `lib/alpaca.ts` controls this.)
   - Not every OANDA account offers every CFD (commodities and index CFDs are region-restricted). If OANDA rejects an order with "not tradeable by the Account", the app caches that instrument as untradeable for 6h and skips it in later cycles.

The routability snapshot test in `brokerRouting.test.ts` lists intentionally unroutable symbols — update it when you add/remove instruments, then run `pnpm --filter @workspace/api-server run test`.

### Add a whole new broker

The app has a plug-in broker framework (`artifacts/api-server/src/lib/brokers/`). One file per broker:

1. Create `brokers/<name>Adapter.ts` implementing the `BrokerAdapter` interface from `brokers/types.ts` — symbol routing, credential lookup, auto-trade budget (atomic reserve/refund), tradeability pre-check, order placement, balances, holdings, and recent trades.
2. Register it in `brokers/index.ts` with `registerBroker(...)`. Registration order matters: routing asks adapters in order and the first match wins.
3. Store its per-user credentials in its own table, encrypted via `credentialCrypto.ts`, and add connect/status endpoints in `routes/broker.ts`.

The auto-trader, manual trades, portfolio, and trade history all pick the new broker up automatically — no changes needed in `realAutoTrade.ts` or the routes. This is also where a SnapTrade aggregator would slot in later, as a single adapter that fans out to many brokerages.

---

## 4. Improve AI Trade Decisions

**File:** `artifacts/api-server/src/lib/realAutoTrade.ts` — the prompt built for each auto-trade cycle

### Add technical indicators to the prompt

```typescript
`## Technical Indicators
- RSI (14): ${rsi.toFixed(1)} ${rsi > 70 ? "(overbought)" : rsi < 30 ? "(oversold)" : "(neutral)"}
- MACD: ${macdHistogram > 0 ? "bullish crossover" : "bearish crossover"}`;
```

### Give the AI recent decision history

Pull the user's recent `auto_trade_events` rows (schema: `lib/db/src/schema/autoTradeEvents.ts`) for the same symbol and append them:

```typescript
`## Recent bot decisions on this instrument (last 5):
${events.map((e) => `  ${e.kind} ${e.symbol} — ${e.detail}`).join("\n")}`;
```

### Prompt structure that works well

```typescript
const prompt = `You are a disciplined quantitative trader.

## Rules (always follow these)
- NEVER exceed the configured per-trade cap
- Cut losses if unrealized P&L < -8% and downtrend confirmed
- In bearish markets, prefer hold over buy

## ${name} (${symbol})
- Price: $${currentPrice} | 24h: ${change24h}%
- Current position: ${positionSummary}

Respond with ONLY:
{"signal":"buy"|"sell"|"hold","confidence":0-100,"reasoning":"2 sentences max"}`;
```

---

## 5. Stop-Loss & Take-Profit Rules (built in — how to tune)

**Files:** `artifacts/api-server/src/lib/dayTradeGuards.ts` (guard logic), `artifacts/crypto-trader/src/pages/auto-trade.tsx` (Day-Trade Exits UI)

Deterministic take-profit / stop-loss exit guards are **already built in**:

- Toggle and thresholds live on the Auto-Trade page (Day-Trade Bot panel, "Day-Trade Exits" section) — stored as `exit_guards_enabled`, `take_profit_pct`, `stop_loss_pct` on the auto-trade settings.
- Exit guards apply to the **day-trade strategy only**: each day-trade cycle rebuilds the day-trade bot's per-user positions (from the last 30 days of executed `auto_trade_events` where `strategy = 'daytrade'`) and sells anything past the TP/SL threshold **before** any AI calls. Long-term positions are never touched by the guards.
- Guard sells bypass the per-trade cap, daily limit, and budget reservation — protective exits free cash and are sell-side only.
- There is deliberately **no forced end-of-day flatten**.

To change guard behavior (e.g. add a trailing stop), edit `dayTradeGuards.ts`. Keep two invariants: guard exits must stay sell-side only, and Alpaca full-position sells are placed **by qty** (not notional) when covering ≥98% of market value — that pattern avoids price-drift rejections.

Related: "protective sells" also exist in the vote logic — when the bot holds a position, a single model's sell vote is enough to exit (see `combineVotes` in `aiEnsemble.ts`), while buys always need the 2-model quorum.

---

## 6. Alerts: Email (built-in) & Webhooks

### Email alerts — already built

Users opt in under **Account → Profile → Notifications**. The server sends one email per user/broker/kind/day (deduped via the `auto_trade_notifications` table) when a broker rejects an auto-trade or the daily cap is first hit.

- Sender code: `artifacts/api-server/src/lib/resendMail.ts` + `autoTradeNotify.ts`
- Configure `RESEND_API_KEY` and a verified `ALERT_FROM_EMAIL`; the payload is sent directly to Resend's REST API.

### Add a Discord/Slack webhook on trade execution

```bash
# env: DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

```typescript
// In realAutoTrade.ts, after an order is accepted:
async function sendWebhook(
  symbol: string,
  side: string,
  amount: number,
  reasoning: string,
) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `🤖 **Auto-Trade Executed**\n${side.toUpperCase()} **${symbol}** — $${amount.toFixed(2)}\n> ${reasoning}`,
    }),
  });
}
```

---

## 7. Add Limit Orders

**Files:** `lib/api-spec/openapi.yaml` first, then `artifacts/api-server/src/routes/trades.ts` / `broker.ts`

```typescript
// Alpaca order body:
{ symbol, side, type: "limit", limit_price: limitPrice.toFixed(2), qty: qty.toString(), time_in_force: "gtc" }

// OANDA order body (lib/oanda.ts):
{ order: { type: "LIMIT", instrument, units, price: limitPrice.toFixed(5), timeInForce: "GTC" } }
```

Workflow: add `limitPrice` to the order schema in `openapi.yaml` → `pnpm --filter @workspace/api-spec run codegen` → restore the `lib/api-zod/src/index.ts` two-line barrel → update route + frontend form.

---

## 8. Add News Sentiment Analysis

Use NewsAPI or CryptoPanic to pull headlines and feed them to Claude:

```typescript
// env: NEWS_API_KEY=...  (free at newsapi.org)
async function getNewsHeadlines(name: string): Promise<string> {
  const res = await fetch(
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(name)}&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`,
  );
  const data = await res.json();
  return (
    data.articles?.map((a: any) => `- ${a.title}`).join("\n") ??
    "No recent news."
  );
}

// In the prompt:
`## Recent News Headlines
${await getNewsHeadlines(coin.name)}`;
```

---

## 9. Deploy to Production

### Production deployment

1. Build everything: `pnpm run build`
2. Serve the API bundle (`artifacts/api-server/dist/index.mjs`) with `PORT`, `BASE_PATH=/api`, `DATABASE_URL`, `SESSION_SECRET`, and the Anthropic vars set
3. Serve the frontend build output as static files (any host: Nginx, Vercel, Netlify) with `/api` reverse-proxied to the API server
4. Push the schema to your prod Postgres: set `DATABASE_URL` to the prod URL, then `pnpm --filter @workspace/db run push` (Neon.tech has a good free tier)
5. Configure the application-owned email/password login and push the production schema before accepting users

---

## 10. Performance Optimizations

### Batch all instruments in one Claude call

Each Claude call takes ~2-3s. Instead of one call per instrument:

```typescript
const batchPrompt = `Analyze these instruments and return a JSON array:
${candidates.map((c) => `- ${c.symbol}: $${price(c)}, 24h ${change(c)}%`).join("\n")}
Return: [{"symbol":"BTC","signal":"buy"|"sell"|"hold","confidence":0-100,"reasoning":"..."}]`;

const message = await anthropic.messages.create({
  model: "claude-haiku-3-5", // haiku is much faster for batch tasks
  max_tokens: 1024,
  messages: [{ role: "user", content: batchPrompt }],
});
```

### Parallel AI calls

```typescript
const results = await Promise.all(candidates.map((c) => getAiDecision(c)));
// Watch rate limits — add small delays if needed
```

> Keep the module-level **cycle lock** on `/auto-trade/run` intact — parallelizing AI calls inside one cycle is fine; running overlapping cycles is not.

### Pre-compute predictions

The Predictions page calls Claude on demand. Consider caching predictions per symbol for 15 minutes server-side.

---

## 11. Auto-Trader Internals & Safety Rails

**File:** `artifacts/api-server/src/lib/realAutoTrade.ts` — read this before changing anything.

How it works today:

- **Opt-in per user, per broker** — Alpaca and OANDA each have their own toggle + caps in the auto-trade settings.
- **Signals come from a 3-model ensemble** (`lib/aiEnsemble.ts`) — buy/sell requires ≥2 agreeing models; one model alone can never trade. Per-model votes appear as badges in the run progress UI.
- **Budget is reserved atomically** via a guarded SQL `UPDATE` _before_ the order is sent, and refunded if the broker rejects. Never replace this with read-then-write logic — it's what prevents daily-cap overruns under concurrency.
- **Day-trading net-spend model** — the daily limit gates buys only; executed sells refund today's spend so the same allotment can be re-deployed on new buys until the UTC day resets. Sells also bypass the per-trade Max Trade Size cap (capped instead by the actual position value).
- **Buys** use the full configured Max Trade Size, capped by the broker's actual available cash (Alpaca buying power / OANDA marginAvailable). Insufficient cash logs a skipped `insufficient_cash` event instead of erroring.
- **Alpaca full-position sells** (≥98% of market value) are placed by `qty_available` instead of notional, avoiding price-drift "insufficient balance" rejections.
- **OANDA units precision** — order units are rounded to each instrument's `tradeUnitsPrecision` (fetched from OANDA and cached 24h; currency pairs allow whole units only). Sells round _down_ and are placed with `positionFill: REDUCE_ONLY`, so a reduce can never overshoot the position or open a short.
- **Wash-trade guard** — an order is skipped (reason `wash_trade`) when the opposite side of the same symbol executed for the same user within the last 2 minutes; brokers (notably Alpaca) reject these as potential wash trades. Take-profit/stop-loss exit sells bypass this guard.
- **Broker minimum order size** — buys below the broker's minimum (Alpaca crypto: $10) are skipped with reason `too_small` instead of being submitted and rejected.
- **OANDA rejections** can arrive with HTTP 201 (orderReject/orderCancel transactions) — `oandaRejectReason()` in `lib/oanda.ts` surfaces friendly reasons (e.g. `MARKET_HALTED` → market closed on weekends).
- **OANDA tradeability pre-check** — `oandaTradeability()` (60s cache) is consulted before every OANDA order (auto + manual), skipping with `market_closed`/`not_tradeable` instead of submitting doomed orders. Account-level "not tradeable by the Account" rejections are remembered for 6h (`markOandaInstrumentUntradeable()`).
- **Two strategies, one engine** — the bot runs as a long-term strategy (`strategy = 'longterm'`) and an opt-in intraday day-trade strategy (`strategy = 'daytrade'`, toggle + own Max Trade Size on the Auto-Trade page's Day-Trade Bot panel). Each executed event is tagged with its strategy, so books, exit guards, and P&L are computed per strategy (`GET /auto-trade/pnl?strategy=…`). The day-trade prompt includes a 5-minute candle table (`GET /auto-trade/candles/{symbol}` serves the same series to the UI); the scheduler runs day-trade cycles continuously (back-to-back) while the US stock market is open (9:30–16:00 ET weekdays) and every 15 minutes after the close, fully independent of the long-term bot: each strategy has its own cycle lock, both can run in parallel, and neither can delay or starve the other (even in continuous long-term mode).
- **Exit guards & P&L** — `lib/dayTradeGuards.ts` (TP/SL exits, day-trade positions only, see section 5) and `lib/autoTradePnl.ts` (30-day avg-cost realized P&L behind `GET /auto-trade/pnl`).
- **Email alerts** — one per user/broker/kind/day on broker rejects or first daily-cap hit, deduped via `auto_trade_notifications` (rows older than 3 days are pruned automatically).
- **`/auto-trade/run` and `/auto-trade/run-stream` are auth-gated and serialized** by a per-strategy cycle lock — a long-term and a day-trade cycle can run at the same time, but never two cycles of the same strategy.

When extending:

- Keep every new order path auth-gated and inside the budget-reservation flow.
- Add tests — `pnpm --filter @workspace/api-server run test` covers routing, budget logic, and auth gating.
- Test with Alpaca **paper** + OANDA **practice** connections before touching live.

---

## File Map — Where Everything Lives

```
lib/
  api-spec/openapi.yaml — API contract (source of truth — edit first, then codegen)
  db/src/schema/
    auth.ts             — users, sessions
    broker.ts           — Alpaca connections (encrypted credentials)
    oanda.ts            — OANDA connections (encrypted credentials)
    autoTrade.ts        — per-user auto-trade settings + caps
    autoTradeEvents.ts  — auto-trade activity log
    notifications.ts    — email-alert dedupe table
    watchlist.ts        — saved instruments
    userProfile.ts      — profile settings

artifacts/api-server/src/
  routes/
    autoTrade.ts        — 🤖 auto-trade endpoints (run/run-stream/settings)
    predictions.ts      — per-instrument Claude predictions
    trades.ts           — manual order execution (routed per broker)
    portfolio.ts        — combined live positions from both brokers
    broker.ts           — Alpaca + OANDA connect/status/account summaries
    account.ts          — profile + notification preferences
    auth.ts             — OIDC login/logout/session
  lib/
    realAutoTrade.ts    — 🤖 real-money bot engine (budget, caps, execution)
    aiEnsemble.ts       — 3-model vote (Claude+GPT+Gemini) + quorum logic
    dayTradeGuards.ts   — take-profit/stop-loss exit guards + bot position book
    autoTradePnl.ts     — 30-day realized P&L (Bot Performance card)
    brokers/            — plug-in broker framework (BrokerAdapter interface,
                          registry, alpacaAdapter.ts, oandaAdapter.ts)
    brokerRouting.ts    — instrument → broker routing (asks adapters in order)
    alpaca.ts           — Alpaca client + ALPACA_UNSUPPORTED_CRYPTO (BNB)
    oanda.ts            — OANDA v20 client, reject-reason parsing, tradeability cache
    coins.ts            — instrument list + simulated display prices
    credentialCrypto.ts — AES-256-GCM encryption for stored broker credentials
    resendMail.ts       — email sending (Resend connector)
    autoTradeNotify.ts  — alert dedupe + composition

artifacts/crypto-trader/src/
  pages/
    dashboard.tsx       — portfolio value, Fear & Greed, movers
    trade.tsx           — manual buy/sell (real orders)
    auto-trade.tsx      — 🤖 auto-trader settings UI
    real-money.tsx      — broker account details + money movement links
    predictions.tsx     — AI signals per instrument
    portfolio.tsx       — combined live holdings + P&L
    history.tsx         — combined order/transaction history
    account.tsx         — profile, notifications, broker connections
  components/
    layout.tsx          — responsive nav (desktop sidebar / mobile drawer)
```

---

## Quick Wins (do these first)

| What                                                             | Time   | Impact                       |
| ---------------------------------------------------------------- | ------ | ---------------------------- |
| Swap faster/cheaper models in `aiEnsemble.ts` for quicker cycles | 5 min  | ⚡ Speed                     |
| Turn on Day-Trade Exits (built-in TP/SL) on the Auto-Trade page  | 1 min  | 🛡️ Risk control              |
| Connect CoinGecko for real crypto display prices                 | 30 min | 📊 Accuracy                  |
| Add Discord webhook alert on executed trades                     | 10 min | 🔔 Notifications             |
| Batch instruments in one Claude call                             | 20 min | ⚡ Much faster runs          |
| Verify a Resend domain + set `ALERT_FROM_EMAIL`                  | 10 min | 📧 Email alerts to all users |
