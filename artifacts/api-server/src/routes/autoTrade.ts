import { Router, type IRouter, Response } from "express";
import {
  db,
  autoTradeSettingsTable,
  autoTradeLogTable,
  autoTradeEventsTable,
  brokerConnectionsTable,
  oandaConnectionsTable,
} from "@workspace/db";
import { getEnsembleSignal, type ModelVote } from "../lib/aiEnsemble";
import { UpdateAutoTradeSettingsBody } from "@workspace/api-zod";
import {
  getLivePrice,
  get24hChange,
  getCandles,
  getCoinBySymbol,
  ALL_ASSETS,
  COINS,
  CANDLE_INTERVAL_MINUTES,
} from "../lib/coins";
import {
  executeRealTrades,
  pruneOldAutoTradeEvents,
} from "../lib/realAutoTrade";
import {
  runExitGuards,
  computeBotBook,
  computeBotHolders,
  type BotBookEntry,
} from "../lib/dayTradeGuards";
import { resolveBrokerRoute } from "../lib/brokerRouting";
import {
  getBroker,
  listBrokers,
  type AutoTradeAccount,
  type MarketBar,
} from "../lib/brokers";
import { computeAutoTradePnl } from "../lib/autoTradePnl";
import { assessTradeRisk } from "../lib/tradeRisk";
import {
  analyzeCandles,
  formatTechnicalAnalysis,
} from "../lib/technicalAnalysis";
import { eq, desc, and, gte } from "drizzle-orm";

const router: IRouter = Router();

// Guards against concurrent trading cycles (manual, streaming, or scheduled).
// Each strategy has its own lock so the day-trade bot runs fully independently
// of the long-term bot — one can never block or starve the other.
const cycleRunning: Record<BotStrategy, boolean> = {
  longterm: false,
  daytrade: false,
};

async function ensureSettings() {
  const existing = await db.select().from(autoTradeSettingsTable).limit(1);
  if (existing.length === 0) {
    await db.insert(autoTradeSettingsTable).values({
      enabled: false,
      riskLevel: "moderate",
      maxTradeAmountUsd: "500",
      intervalMinutes: 60,
      runMode: "interval",
      scheduledTime: null,
      assetClasses: "crypto,stock,forex,futures,commodity",
    });
  }
  return db
    .select()
    .from(autoTradeSettingsTable)
    .limit(1)
    .then((r) => r[0]);
}

function formatSettings(s: typeof autoTradeSettingsTable.$inferSelect) {
  return {
    id: s.id,
    enabled: s.enabled,
    riskLevel: s.riskLevel,
    maxTradeAmountUsd: parseFloat(s.maxTradeAmountUsd),
    intervalMinutes: s.intervalMinutes,
    runMode: s.runMode ?? "interval",
    scheduledTime: s.scheduledTime ?? null,
    assetClasses: s.assetClasses ?? "crypto,stock,forex,futures,commodity",
    lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
    exitGuardsEnabled: s.exitGuardsEnabled ?? false,
    takeProfitPct: s.takeProfitPct != null ? parseFloat(s.takeProfitPct) : null,
    stopLossPct: s.stopLossPct != null ? parseFloat(s.stopLossPct) : null,
    dayTradeEnabled: s.dayTradeEnabled ?? false,
    dayTradeMaxUsd: parseFloat(s.dayTradeMaxUsd ?? "200"),
  };
}

type BotStrategy = "longterm" | "daytrade";

async function getNativeBars(
  symbol: string,
  assetType: string,
  timeframe: "5m" | "1h",
  accountCache: Map<string, AutoTradeAccount[]>,
): Promise<{ bars: MarketBar[]; source: "broker" | "simulated" }> {
  const candidates = await Promise.all(
    listBrokers().map(async (adapter) => {
      const route = adapter.routeSymbol(symbol, assetType);
      if (!route) return null;
      let accounts = accountCache.get(adapter.id);
      if (!accounts) {
        accounts = await adapter.listAutoTradeAccounts();
        accountCache.set(adapter.id, accounts);
      }
      const account = accounts[0];
      if (!account) return null;
      const bars = await adapter
        .getMarketBars(account.creds, route.brokerSymbol, timeframe, 40)
        .catch(() => null);
      if (!bars || bars.length < 10) return null;
      return { bars, latest: Date.parse(bars.at(-1)!.time) };
    }),
  );
  const freshest = candidates
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null,
    )
    .filter((candidate) => Number.isFinite(candidate.latest))
    .sort((a, b) => b.latest - a.latest)[0];
  return freshest
    ? { bars: freshest.bars, source: "broker" }
    : { bars: [], source: "simulated" };
}

router.get("/auto-trade/settings", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    res.json(formatSettings(await ensureSettings()));
  } catch {
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/auto-trade/settings", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const parsed = UpdateAutoTradeSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const settings = await ensureSettings();
    const updates: Partial<typeof autoTradeSettingsTable.$inferInsert> = {};
    if (parsed.data.enabled !== undefined)
      updates.enabled = parsed.data.enabled;
    if (parsed.data.riskLevel !== undefined)
      updates.riskLevel = parsed.data.riskLevel;
    if (parsed.data.maxTradeAmountUsd !== undefined)
      updates.maxTradeAmountUsd = parsed.data.maxTradeAmountUsd.toString();
    if (parsed.data.intervalMinutes !== undefined)
      updates.intervalMinutes = parsed.data.intervalMinutes;
    if (parsed.data.runMode !== undefined)
      updates.runMode = parsed.data.runMode;
    if (parsed.data.scheduledTime !== undefined)
      updates.scheduledTime = parsed.data.scheduledTime || null;
    if (parsed.data.assetClasses !== undefined)
      updates.assetClasses = parsed.data.assetClasses;
    if (parsed.data.exitGuardsEnabled !== undefined)
      updates.exitGuardsEnabled = parsed.data.exitGuardsEnabled;
    if (parsed.data.takeProfitPct !== undefined)
      updates.takeProfitPct =
        parsed.data.takeProfitPct != null
          ? parsed.data.takeProfitPct.toString()
          : null;
    if (parsed.data.stopLossPct !== undefined)
      updates.stopLossPct =
        parsed.data.stopLossPct != null
          ? parsed.data.stopLossPct.toString()
          : null;
    if (parsed.data.dayTradeEnabled !== undefined)
      updates.dayTradeEnabled = parsed.data.dayTradeEnabled;
    if (parsed.data.dayTradeMaxUsd !== undefined)
      updates.dayTradeMaxUsd = parsed.data.dayTradeMaxUsd.toString();
    const [updated] = await db
      .update(autoTradeSettingsTable)
      .set(updates)
      .where(eq(autoTradeSettingsTable.id, settings.id))
      .returning();
    res.json(formatSettings(updated));
  } catch {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/auto-trade/stats", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const logs = await db
      .select()
      .from(autoTradeLogTable)
      .orderBy(desc(autoTradeLogTable.createdAt))
      .limit(200);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = logs.filter((l) => new Date(l.createdAt) >= today);
    res.json({
      totalEvaluated: logs.length,
      totalExecuted: logs.filter((l) => l.executed).length,
      todayExecuted: todayLogs.filter((l) => l.executed).length,
      buySignals: logs.filter((l) => l.decision === "buy").length,
      sellSignals: logs.filter((l) => l.decision === "sell").length,
      avgConfidence:
        logs.length > 0
          ? Math.round(
              logs.reduce((s, l) => s + parseFloat(l.confidence), 0) /
                logs.length,
            )
          : 0,
      totalVolumeUsd: logs
        .filter((l) => l.executed)
        .reduce((s, l) => s + parseFloat(l.amountUsd), 0),
    });
  } catch {
    res.status(500).json({ error: "Failed to get stats" });
  }
});

function sseEvent(res: Response, type: string, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

async function executeAutoTradeCycle(
  settings: typeof autoTradeSettingsTable.$inferSelect,
  coinFilter?: string[],
  emit?: (type: string, data: Record<string, unknown>) => void,
  strategy: BotStrategy = "longterm",
) {
  const isDayTrade = strategy === "daytrade";
  // Retention: keep the auto-trade activity history bounded (throttled internally).
  await pruneOldAutoTradeEvents();

  // Exit guards belong to the day-trade bot: sell day-trade positions past
  // take-profit/stop-loss thresholds before analyzing new entries.
  let guardExits = 0;
  if (isDayTrade && settings.exitGuardsEnabled) {
    guardExits = await runExitGuards({
      takeProfitPct:
        settings.takeProfitPct != null
          ? parseFloat(settings.takeProfitPct)
          : null,
      stopLossPct:
        settings.stopLossPct != null ? parseFloat(settings.stopLossPct) : null,
      emit,
    });
  }

  // The bot's current book (this strategy only) gives the AI position context
  // for exit decisions.
  const botBook: BotBookEntry[] = await computeBotBook(strategy).catch(
    () => [],
  );
  // Per-user holders: relaxed (protective) sells may only execute for users
  // whose OWN bot book holds the symbol — never against other users' manual
  // holdings.
  const botHolders = await computeBotHolders(strategy).catch(
    () => new Map<string, Set<string>>(),
  );

  const maxAmount = isDayTrade
    ? parseFloat(settings.dayTradeMaxUsd ?? "200")
    : parseFloat(settings.maxTradeAmountUsd);
  const riskLevel = settings.riskLevel;
  const minConfidence =
    riskLevel === "conservative" ? 78 : riskLevel === "moderate" ? 62 : 48;

  // Only asset classes that can actually be routed to a linked real broker are considered.
  const enabledClasses = (
    settings.assetClasses ?? "crypto,stock,forex,futures,commodity"
  )
    .split(",")
    .map((s) => s.trim());
  const classPool = ALL_ASSETS.filter(
    (a) =>
      enabledClasses.includes(a.assetType) &&
      resolveBrokerRoute(a.symbol, a.assetType) !== null,
  );

  const candidateAssets =
    coinFilter && coinFilter.length > 0
      ? classPool.filter((a) => coinFilter.includes(a.symbol))
      : classPool;

  // Market snapshot from crypto for sentiment (always available)
  const cryptoSnapshot = COINS.slice(0, 10).map((c) => ({
    symbol: c.symbol,
    price: getLivePrice(c.symbol, c.basePrice),
    change24h: get24hChange(c.symbol),
  }));
  const bullishCount = cryptoSnapshot.filter((c) => c.change24h > 0).length;
  const marketSentiment =
    bullishCount >= 7
      ? "strongly bullish"
      : bullishCount >= 5
        ? "mixed/neutral"
        : bullishCount >= 3
          ? "bearish"
          : "strongly bearish";
  const topGainer = [...cryptoSnapshot].sort(
    (a, b) => b.change24h - a.change24h,
  )[0];
  const topLoser = [...cryptoSnapshot].sort(
    (a, b) => a.change24h - b.change24h,
  )[0];

  const total = candidateAssets.length;
  emit?.("start", { total, marketSentiment, bullishCount });

  const logEntries: Array<{
    symbol: string;
    name: string;
    decision: "buy" | "sell" | "hold";
    reasoning: string;
    confidence: number;
    amountUsd: number;
    executed: boolean;
    tradeId: number | null;
    logoUrl: string;
  }> = [];
  const marketAccountCache = new Map<string, AutoTradeAccount[]>();
  const allowSimulatedData =
    process.env.ALLOW_SIMULATED_TRADING_DATA === "true";

  for (let i = 0; i < candidateAssets.length; i++) {
    const asset = candidateAssets[i];
    const currentPrice = getLivePrice(asset.symbol, asset.basePrice);
    const change24h = get24hChange(asset.symbol);
    const route = resolveBrokerRoute(asset.symbol, asset.assetType)!;

    emit?.("analyzing", {
      index: i + 1,
      total,
      symbol: asset.symbol,
      name: asset.name,
      logoUrl: asset.logoUrl,
      assetType: asset.assetType,
    });

    let aiResponse: {
      signal: string;
      confidence: number;
      reasoning: string;
      votes?: ModelVote[];
      entryQuality: number;
      riskReward: number;
      stopLossPct: number;
      takeProfitPct: number;
      regime: string;
      riskFlags: string[];
    } = {
      signal: "hold",
      confidence: 45,
      reasoning: "AI analysis unavailable — holding current position.",
      entryQuality: 0,
      riskReward: 0,
      stopLossPct: 0,
      takeProfitPct: 0,
      regime: "unknown",
      riskFlags: ["data_stale"],
    };

    const bookEntry = botBook.find((b) => b.symbol === asset.symbol);

    const nativeBars = await getNativeBars(
      asset.symbol,
      asset.assetType,
      isDayTrade ? "5m" : "1h",
      marketAccountCache,
    );
    const candles =
      nativeBars.bars.length > 0
        ? nativeBars.bars
        : getCandles(asset.symbol, asset.basePrice);
    const technicalAnalysis = analyzeCandles(candles, currentPrice);
    // Broker-native bars are preferred. Simulated candles remain available for
    // local development, but are marked stale and block new entries by default.
    const candleSection = (() => {
      const recent = candles.slice(-12);
      const fmt = (n: number) =>
        n < 1 ? n.toFixed(5) : n < 10 ? n.toFixed(4) : n.toFixed(2);
      return `
## Market Candles (${isDayTrade ? CANDLE_INTERVAL_MINUTES : 60}-minute, ${nativeBars.source} source, oldest → newest, last ${recent.length} of ${candles.length})
time | open | high | low | close
${recent.map((c) => `${c.time.slice(11, 16)} | ${fmt(c.open)} | ${fmt(c.high)} | ${fmt(c.low)} | ${fmt(c.close)}`).join("\n")}
Read the candles for momentum, trend, and reversal patterns before deciding. Treat simulated data as unreliable.`;
  })() + formatTechnicalAnalysis(technicalAnalysis);

    try {
      const prompt = `${
        isDayTrade
          ? `You are a professional day-trading AI issuing real-money intraday trade signals across multiple asset classes. Orders execute on opted-in broker accounts with strict per-trade and daily spending caps. You trade actively within the day: take profits when a position has moved in your favor, cut losers early, and re-enter when a fresh setup appears. Base your decision primarily on the intraday candlestick series below. Be disciplined.`
          : `You are a professional portfolio-management AI issuing real-money trade signals across multiple asset classes. Orders execute on opted-in broker accounts with strict per-trade and daily spending caps. You take a longer-term swing/position view: enter on durable setups, let winners run over days or weeks, and exit when the thesis breaks — do not churn positions on intraday noise.`
      }

## Market Context (${new Date().toUTCString()})
- Crypto sentiment: ${marketSentiment} (${bullishCount}/10 positive)
- Top crypto gainer: ${topGainer.symbol} +${topGainer.change24h.toFixed(2)}%
- Top crypto loser: ${topLoser.symbol} ${topLoser.change24h.toFixed(2)}%
- Risk profile: ${riskLevel}
- Asset class: ${asset.assetType.toUpperCase()}
${route.note ? `- Execution note: ${route.note}` : ""}

## Target Asset: ${asset.name} (${asset.symbol})
- Asset class: ${asset.assetType}
- Reference price: $${currentPrice < 1 ? currentPrice.toFixed(5) : currentPrice < 10 ? currentPrice.toFixed(4) : currentPrice.toFixed(2)}
- 24h Change: ${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}%
${candleSection}
## Bot Position in This Asset
${
  bookEntry
    ? `- The bot currently HOLDS ${bookEntry.openQty.toFixed(6)} units, average entry $${bookEntry.avgCostUsd < 1 ? bookEntry.avgCostUsd.toFixed(5) : bookEntry.avgCostUsd.toFixed(2)}, unrealized ${bookEntry.unrealizedPct >= 0 ? "+" : ""}${bookEntry.unrealizedPct.toFixed(2)}%
- Actively manage this position: signal "sell" to take profit if the move looks extended, or to cut the loss if the setup has failed. Signal "hold" only if the position still has an edge.`
    : `- The bot holds NO position in this asset. A "sell" signal only applies if the user independently holds it; focus on whether this is a good ${isDayTrade ? "intraday entry" : "longer-term entry"}.`
}

## Decision Rules
- Real money is at stake — only signal buy/sell with genuine conviction
- ${isDayTrade ? "Day-trading mindset: capture intraday moves, don't marry positions" : "Position-trading mindset: favor durable multi-day setups over intraday noise"}
- Prefer hold when the setup is unclear
- Treat the deterministic technical analysis as hard evidence and do not override its risk flags without a specific reason.
- Do not buy if the expected move does not support at least 2:1 reward/risk; do not chase near resistance.
- ${asset.assetType === "futures" || asset.assetType === "commodity" ? "Leveraged CFD instruments: require higher conviction (65%+ confidence min)" : "Standard risk rules apply"}

Respond ONLY with valid JSON (no markdown):
{"signal":"buy"|"sell"|"hold","confidence":0-100,"entryQuality":0-100,"riskReward":number,"stopLossPct":number,"takeProfitPct":number,"regime":"bullish_trend"|"bearish_trend"|"range"|"volatile","riskFlags":[],"reasoning":"2-3 sentences with key factors for this specific asset class"}`;

      // The bot holds this position (for at least one user) → a single
      // model's sell vote is enough to exit (protective sell). Buys still
      // need a 2-model quorum.
      aiResponse = await getEnsembleSignal(prompt, {
        protectiveSell: (botHolders.get(asset.symbol)?.size ?? 0) > 0,
      });
    } catch {
      /* use default */
    }

    const decision: "buy" | "sell" | "hold" =
      aiResponse.signal === "buy"
        ? "buy"
        : aiResponse.signal === "sell"
          ? "sell"
          : "hold";
    const confidence = Math.min(100, Math.max(0, aiResponse.confidence ?? 50));
    const riskAssessment = assessTradeRisk({
      signal: decision,
      confidence,
      entryQuality: aiResponse.entryQuality ?? 0,
      riskReward: aiResponse.riskReward ?? 0,
      stopLossPct: aiResponse.stopLossPct ?? 0,
      takeProfitPct: aiResponse.takeProfitPct ?? 0,
      riskFlags: [
        ...(aiResponse.riskFlags ?? []),
        ...technicalAnalysis.riskFlags,
        ...(nativeBars.source === "simulated" && !allowSimulatedData
          ? ["data_stale"]
          : []),
      ],
      assetType: asset.assetType,
      strategy,
      hasPosition: Boolean(bookEntry),
    });
    const riskNote = riskAssessment.allowed
      ? `Risk arbiter approved (score ${riskAssessment.riskScore}).`
      : `Risk arbiter blocked: ${riskAssessment.reasons.join(", ")}.`;
    const reasoning = `${aiResponse.reasoning ?? "No reasoning provided."} ${riskNote}`;

    const isLeveraged =
      asset.assetType === "futures" || asset.assetType === "commodity";
    const effectiveMinConfidence = isLeveraged
      ? Math.max(minConfidence, 65)
      : minConfidence;

    let executed = false;
    let amountUsd = 0;

    // A sell meets the "normal bar" when it has a 2-model quorum AND passes
    // the confidence gate — those execute for every opted-in user, as before.
    // A protective sell (single vote and/or below the confidence gate) only
    // exists because the bot holds the position, so it executes ONLY for the
    // users whose own bot book holds this symbol.
    const sellVotes = (aiResponse.votes ?? []).filter(
      (v) => v.signal === "sell",
    ).length;
    const meetsNormalBar =
      confidence >= effectiveMinConfidence &&
      (decision !== "sell" || sellVotes >= 2);
    const holderIds =
      decision === "sell" ? [...(botHolders.get(asset.symbol) ?? [])] : [];
    if (
      (decision === "buy" || decision === "sell") &&
      riskAssessment.allowed &&
      (meetsNormalBar || holderIds.length > 0)
    ) {
      // Invest the full configured max trade amount; the executor caps it by
      // per-trade/daily limits and the broker's actual available cash.
      amountUsd = Math.max(1, maxAmount);
      try {
        let ordersPlaced = 0;
        if (meetsNormalBar) {
          ordersPlaced = await executeRealTrades({
            symbol: asset.symbol,
            assetType: asset.assetType,
            side: decision,
            notionalHint: amountUsd,
            strategy,
          });
        } else {
          for (const userId of holderIds) {
            ordersPlaced += await executeRealTrades({
              symbol: asset.symbol,
              assetType: asset.assetType,
              side: "sell",
              notionalHint: amountUsd,
              onlyUserId: userId,
              strategy,
            });
          }
        }
        executed = ordersPlaced > 0;
      } catch {
        /* order failed */
      }
    }

    logEntries.push({
      symbol: asset.symbol,
      name: asset.name,
      decision,
      reasoning,
      confidence,
      amountUsd: executed ? amountUsd : 0,
      executed,
      tradeId: null,
      logoUrl: asset.logoUrl,
    });
    emit?.("result", {
      index: i + 1,
      total,
      symbol: asset.symbol,
      name: asset.name,
      logoUrl: asset.logoUrl,
      assetType: asset.assetType,
      decision,
      confidence,
      reasoning,
      amountUsd: executed ? amountUsd : 0,
      executed,
      votes: aiResponse.votes ?? [],
      entryQuality: aiResponse.entryQuality,
      riskReward: aiResponse.riskReward,
      stopLossPct: aiResponse.stopLossPct,
      takeProfitPct: aiResponse.takeProfitPct,
      regime: aiResponse.regime,
      riskFlags: [
        ...(aiResponse.riskFlags ?? []),
        ...(nativeBars.source === "simulated" && !allowSimulatedData
          ? ["data_stale"]
          : []),
      ],
      marketDataSource: nativeBars.source,
      riskApproved: riskAssessment.allowed,
      riskScore: riskAssessment.riskScore,
      riskReasons: riskAssessment.reasons,
    });
  }

  for (const entry of logEntries) {
    await db.insert(autoTradeLogTable).values({
      symbol: entry.symbol,
      name: entry.name,
      decision: entry.decision,
      reasoning: entry.reasoning,
      confidence: entry.confidence.toString(),
      amountUsd: entry.amountUsd.toString(),
      executed: entry.executed,
      tradeId: entry.tradeId,
      logoUrl: entry.logoUrl,
    });
  }

  await db
    .update(autoTradeSettingsTable)
    .set(
      isDayTrade
        ? { dayTradeLastRunAt: new Date() }
        : { lastRunAt: new Date() },
    )
    .where(eq(autoTradeSettingsTable.id, settings.id));

  const tradesExecuted =
    logEntries.filter((e) => e.executed).length + guardExits;
  emit?.("complete", {
    tradesExecuted,
    entriesEvaluated: logEntries.length,
    guardExits,
  });
  return { tradesExecuted, entriesEvaluated: logEntries.length };
}

router.get("/auto-trade/run-status", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({
    running: cycleRunning.longterm || cycleRunning.daytrade,
    longtermRunning: cycleRunning.longterm,
    daytradeRunning: cycleRunning.daytrade,
  });
});

// SSE streaming run
router.get("/auto-trade/run-stream", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const strategy: BotStrategy =
    req.query.strategy === "daytrade" ? "daytrade" : "longterm";
  if (cycleRunning[strategy]) {
    res
      .status(409)
      .json({ error: "A trading cycle is already running for this strategy" });
    return;
  }
  cycleRunning[strategy] = true;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": heartbeat\n\n");
  }, 5000);
  const coinFilter = req.query.coins
    ? (req.query.coins as string).split(",").filter(Boolean)
    : undefined;
  const emit = (type: string, data: Record<string, unknown>) => {
    if (!res.writableEnded) sseEvent(res, type, data);
  };

  req.on("close", () => clearInterval(heartbeat));
  try {
    const settings = await ensureSettings();
    await executeAutoTradeCycle(settings, coinFilter, emit, strategy);
  } catch {
    emit("error", { message: "Auto-trade cycle failed" });
  } finally {
    cycleRunning[strategy] = false;
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

router.post("/auto-trade/run", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const strategy: BotStrategy =
    req.body?.strategy === "daytrade" ? "daytrade" : "longterm";
  if (cycleRunning[strategy]) {
    res
      .status(409)
      .json({ error: "A trading cycle is already running for this strategy" });
    return;
  }
  cycleRunning[strategy] = true;
  try {
    const settings = await ensureSettings();
    const coinFilter = Array.isArray(req.body?.coins)
      ? (req.body.coins as string[])
      : undefined;
    const result = await executeAutoTradeCycle(
      settings,
      coinFilter,
      undefined,
      strategy,
    );
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to run auto-trade cycle" });
  } finally {
    cycleRunning[strategy] = false;
  }
});

router.get("/auto-trade/log", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const entries = await db
      .select()
      .from(autoTradeLogTable)
      .orderBy(desc(autoTradeLogTable.createdAt))
      .limit(100);
    res.json(
      entries.map((e) => ({
        id: e.id,
        symbol: e.symbol,
        name: e.name,
        decision: e.decision,
        reasoning: e.reasoning,
        confidence: parseFloat(e.confidence),
        amountUsd: parseFloat(e.amountUsd),
        executed: e.executed,
        tradeId: e.tradeId,
        createdAt: e.createdAt.toISOString(),
        logoUrl: e.logoUrl,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to get auto-trade log" });
  }
});

router.get("/auto-trade/events", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(autoTradeEventsTable)
      .where(eq(autoTradeEventsTable.userId, req.user!.id))
      .orderBy(desc(autoTradeEventsTable.createdAt))
      .limit(100);
    res.json(
      rows.map((e) => ({
        id: e.id,
        broker: e.broker,
        symbol: e.symbol,
        side: e.side,
        notionalUsd: parseFloat(e.notionalUsd),
        outcome: e.outcome,
        reasonCode: e.reasonCode,
        message: e.message,
        createdAt: e.createdAt.toISOString(),
        strategy: e.strategy ?? "longterm",
        fillPrice: e.fillPrice != null ? parseFloat(e.fillPrice) : null,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to get auto-trade events" });
  }
});

router.get("/auto-trade/pnl", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const windowDays = 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const strategy =
      req.query.strategy === "daytrade"
        ? "daytrade"
        : req.query.strategy === "longterm"
          ? "longterm"
          : undefined;
    const rows = await db
      .select()
      .from(autoTradeEventsTable)
      .where(
        and(
          eq(autoTradeEventsTable.userId, req.user!.id),
          eq(autoTradeEventsTable.outcome, "executed"),
          gte(autoTradeEventsTable.createdAt, since),
          ...(strategy ? [eq(autoTradeEventsTable.strategy, strategy)] : []),
        ),
      )
      .orderBy(autoTradeEventsTable.createdAt);

    res.json({ windowDays, ...computeAutoTradePnl(rows) });
  } catch (err) {
    req.log.error({ err }, "Failed to compute auto-trade P&L");
    res.status(500).json({ error: "Failed to compute auto-trade P&L" });
  }
});

// The intraday candle series the day-trade bot analyzes for an instrument —
// the same cached series is fed to the AI prompt and rendered by the UI.
router.get("/auto-trade/candles/:symbol", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const asset = getCoinBySymbol(req.params.symbol);
  if (!asset) {
    res.status(404).json({ error: "Unknown symbol" });
    return;
  }
  const route = resolveBrokerRoute(asset.symbol, asset.assetType);
  if (route) {
    const adapter = getBroker(route.broker);
    const connection = adapter
      ? await adapter.getConnection(req.user!.id)
      : undefined;
    if (adapter && connection) {
      const nativeBars = await adapter
        .getMarketBars(connection.creds, route.brokerSymbol, "5m", 40)
        .catch(() => null);
      if (nativeBars && nativeBars.length >= 10) {
        res.json({
          symbol: asset.symbol,
          intervalMinutes: CANDLE_INTERVAL_MINUTES,
          source: "broker",
          candles: nativeBars,
        });
        return;
      }
    }
  }

  res.json({
    symbol: asset.symbol,
    intervalMinutes: CANDLE_INTERVAL_MINUTES,
    source: "simulated",
    candles: getCandles(asset.symbol, asset.basePrice),
  });
});

router.get("/auto-trade/alerts", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [alpacaConn] = await db
      .select()
      .from(brokerConnectionsTable)
      .where(eq(brokerConnectionsTable.userId, userId))
      .limit(1);
    const [oandaConn] = await db
      .select()
      .from(oandaConnectionsTable)
      .where(eq(oandaConnectionsTable.userId, userId))
      .limit(1);
    const recentEvents = await db
      .select()
      .from(autoTradeEventsTable)
      .where(
        and(
          eq(autoTradeEventsTable.userId, userId),
          gte(autoTradeEventsTable.createdAt, since),
        ),
      )
      .orderBy(desc(autoTradeEventsTable.createdAt))
      .limit(200);

    const brokerAlert = (
      conn:
        | {
            autoTradeEnabled: boolean;
            autoTradeDailyLimitUsd: string;
            spentTodayUsd: string;
            spendDate: string | null;
          }
        | undefined,
      broker: string,
    ) => {
      const spentToday =
        conn && conn.spendDate === today ? parseFloat(conn.spentTodayUsd) : 0;
      const dailyLimit = conn ? parseFloat(conn.autoTradeDailyLimitUsd) : 0;
      return {
        connected: !!conn,
        autoTradeEnabled: !!conn?.autoTradeEnabled,
        dailyLimitReached:
          !!conn?.autoTradeEnabled && dailyLimit - spentToday < 1,
        spentTodayUsd: spentToday,
        dailyLimitUsd: dailyLimit,
        recentRejections: recentEvents.filter(
          (e) => e.broker === broker && e.outcome === "rejected",
        ).length,
      };
    };

    const lastRejection = recentEvents.find((e) => e.outcome === "rejected");
    res.json({
      alpaca: brokerAlert(alpacaConn, "alpaca"),
      oanda: brokerAlert(oandaConn, "oanda"),
      lastRejectionMessage: lastRejection?.message ?? null,
    });
  } catch {
    res.status(500).json({ error: "Failed to get auto-trade alerts" });
  }
});

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// The day-trade bot runs on its own intraday cadence, independent of the
// long-term bot's run mode: continuous (back-to-back cycles) while the US
// stock market is open, easing to a fixed 15-minute cadence after the close
// (crypto and forex keep trading around the clock, just at the slower pace).
const DAY_TRADE_OFFHOURS_CADENCE_MS = 15 * 60 * 1000;

export function isUsMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutes =
    (parseInt(get("hour"), 10) % 24) * 60 + parseInt(get("minute"), 10);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60; // 9:30–16:00 ET
}

export function startAutoTradeScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(async () => {
    try {
      const rows = await db.select().from(autoTradeSettingsTable).limit(1);
      if (!rows.length) return;
      const settings = rows[0];

      // Each strategy has its own lock and fires independently, in parallel —
      // a running long-term cycle never delays the day-trade bot, and the
      // day-trade bot never postpones a due long-term run.
      const cycles: Promise<void>[] = [];

      // Day-trade bot: continuous while the US market is open, every 15
      // minutes after the close.
      if (settings.dayTradeEnabled && !cycleRunning.daytrade) {
        const lastDayRun = settings.dayTradeLastRunAt
          ? settings.dayTradeLastRunAt.getTime()
          : 0;
        const cadenceMs = isUsMarketOpen() ? 0 : DAY_TRADE_OFFHOURS_CADENCE_MS;
        if (Date.now() - lastDayRun >= cadenceMs) {
          cycleRunning.daytrade = true;
          cycles.push(
            executeAutoTradeCycle(settings, undefined, undefined, "daytrade")
              .then(() => undefined)
              .catch(() => undefined)
              .finally(() => {
                cycleRunning.daytrade = false;
              }),
          );
        }
      }

      // Long-term auto-trade bot: obeys its own run mode.
      if (settings.enabled && !cycleRunning.longterm) {
        const runMode = settings.runMode ?? "interval";
        const lastRun = settings.lastRunAt ? settings.lastRunAt.getTime() : 0;
        let shouldRun = false;
        if (runMode === "continuous") {
          shouldRun = true;
        } else if (runMode === "scheduled") {
          if (settings.scheduledTime) {
            const now = new Date();
            const cur = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
            shouldRun =
              cur === settings.scheduledTime && lastRun < Date.now() - 60_000;
          }
        } else {
          shouldRun =
            Date.now() - lastRun >= settings.intervalMinutes * 60 * 1000;
        }
        if (shouldRun) {
          cycleRunning.longterm = true;
          cycles.push(
            executeAutoTradeCycle(settings)
              .then(() => undefined)
              .catch(() => undefined)
              .finally(() => {
                cycleRunning.longterm = false;
              }),
          );
        }
      }

      await Promise.all(cycles);
    } catch {
      // Locks are released in each cycle's own finally handler.
    }
  }, 30_000);
}

export default router;
