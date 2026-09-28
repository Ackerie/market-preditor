import { and, eq, gte } from "drizzle-orm";
import { db, autoTradeEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { computeAutoTradePnl, type PnlPosition } from "./autoTradePnl";
import { executeRealTrades } from "./realAutoTrade";
import { ALL_ASSETS, getLivePrice } from "./coins";

const POSITION_WINDOW_DAYS = 30;

export interface ExitDecision {
  exit: "take_profit" | "stop_loss" | null;
  unrealizedPct: number;
}

/**
 * Decide whether a bot position should be exited given the current price and
 * the configured take-profit / stop-loss thresholds (either may be null =
 * disabled). Pure and unit-testable.
 */
export function decideExit(
  position: Pick<PnlPosition, "openQty" | "avgCostUsd">,
  currentPrice: number,
  takeProfitPct: number | null,
  stopLossPct: number | null,
): ExitDecision {
  if (position.openQty <= 0 || position.avgCostUsd == null || position.avgCostUsd <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { exit: null, unrealizedPct: 0 };
  }
  const unrealizedPct = ((currentPrice - position.avgCostUsd) / position.avgCostUsd) * 100;
  if (takeProfitPct != null && takeProfitPct > 0 && unrealizedPct >= takeProfitPct) {
    return { exit: "take_profit", unrealizedPct };
  }
  if (stopLossPct != null && stopLossPct > 0 && unrealizedPct <= -stopLossPct) {
    return { exit: "stop_loss", unrealizedPct };
  }
  return { exit: null, unrealizedPct };
}

/**
 * Aggregate view of the bot's own book (all users combined), used to give
 * the AI position context: what the bot holds, at what average entry, and
 * the current unrealized move.
 */
export interface BotBookEntry {
  symbol: string;
  openQty: number;
  avgCostUsd: number;
  unrealizedPct: number;
}

export async function computeBotBook(strategy?: "longterm" | "daytrade"): Promise<BotBookEntry[]> {
  const since = new Date(Date.now() - POSITION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(autoTradeEventsTable)
    .where(and(
      eq(autoTradeEventsTable.outcome, "executed"),
      gte(autoTradeEventsTable.createdAt, since),
      ...(strategy ? [eq(autoTradeEventsTable.strategy, strategy)] : []),
    ))
    .orderBy(autoTradeEventsTable.createdAt);

  // Merge brokers: the AI context cares about the instrument, not the venue.
  const bySymbol = new Map<string, { openQty: number; costUsd: number }>();
  for (const p of computeAutoTradePnl(rows).positions) {
    if (p.openQty <= 0 || p.avgCostUsd == null) continue;
    const cur = bySymbol.get(p.symbol) ?? { openQty: 0, costUsd: 0 };
    cur.openQty += p.openQty;
    cur.costUsd += p.openQty * p.avgCostUsd;
    bySymbol.set(p.symbol, cur);
  }

  const book: BotBookEntry[] = [];
  for (const [symbol, { openQty, costUsd }] of bySymbol) {
    const asset = ALL_ASSETS.find((a) => a.symbol === symbol);
    if (!asset || openQty <= 0) continue;
    const avgCostUsd = costUsd / openQty;
    const price = getLivePrice(symbol, asset.basePrice);
    book.push({
      symbol,
      openQty,
      avgCostUsd,
      unrealizedPct: avgCostUsd > 0 ? ((price - avgCostUsd) / avgCostUsd) * 100 : 0,
    });
  }
  return book;
}

/**
 * Per-user view of who the bot holds each symbol FOR. Protective (relaxed
 * criteria) sells must only execute for users whose own bot book has an open
 * position — a global aggregate would let one user's position trigger
 * relaxed sells against other users' manual holdings.
 */
export async function computeBotHolders(strategy?: "longterm" | "daytrade"): Promise<Map<string, Set<string>>> {
  const since = new Date(Date.now() - POSITION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(autoTradeEventsTable)
    .where(and(
      eq(autoTradeEventsTable.outcome, "executed"),
      gte(autoTradeEventsTable.createdAt, since),
      ...(strategy ? [eq(autoTradeEventsTable.strategy, strategy)] : []),
    ))
    .orderBy(autoTradeEventsTable.createdAt);

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  const holders = new Map<string, Set<string>>();
  for (const [userId, userRows] of byUser) {
    for (const p of computeAutoTradePnl(userRows).positions) {
      if (p.openQty <= 0) continue;
      const set = holders.get(p.symbol) ?? new Set<string>();
      set.add(userId);
      holders.set(p.symbol, set);
    }
  }
  return holders;
}

/**
 * Day-trading exit guards: for every opted-in user, check each bot position
 * (rebuilt from executed auto-trade events) against the configured
 * take-profit / stop-loss thresholds and sell the full position when hit.
 * Sells are per-user targeted and bypass spend caps (they free cash).
 * Never throws — guard failures must not block the trading cycle.
 */
export async function runExitGuards(opts: {
  takeProfitPct: number | null;
  stopLossPct: number | null;
  emit?: (type: string, data: Record<string, unknown>) => void;
}): Promise<number> {
  if (opts.takeProfitPct == null && opts.stopLossPct == null) return 0;
  let exits = 0;
  try {
    const since = new Date(Date.now() - POSITION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Exit guards belong to the day-trade bot: only positions the day-trade
    // strategy opened are guarded.
    const rows = await db
      .select()
      .from(autoTradeEventsTable)
      .where(and(
        eq(autoTradeEventsTable.outcome, "executed"),
        eq(autoTradeEventsTable.strategy, "daytrade"),
        gte(autoTradeEventsTable.createdAt, since),
      ))
      .orderBy(autoTradeEventsTable.createdAt);

    const byUser = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push(r);
      byUser.set(r.userId, list);
    }

    for (const [userId, userRows] of byUser) {
      const { positions } = computeAutoTradePnl(userRows);
      for (const pos of positions) {
        if (pos.openQty <= 0 || pos.avgCostUsd == null) continue;
        const asset = ALL_ASSETS.find((a) => a.symbol === pos.symbol);
        if (!asset) continue;
        const price = getLivePrice(pos.symbol, asset.basePrice);
        const decision = decideExit(pos, price, opts.takeProfitPct, opts.stopLossPct);
        if (!decision.exit) continue;

        // Sell the full open position; the executor caps to the broker's
        // actual position value, so a generous hint yields a full exit.
        const notionalHint = Math.max(1, pos.openQty * price * 1.05);
        logger.info(
          { userId, symbol: pos.symbol, exit: decision.exit, unrealizedPct: decision.unrealizedPct },
          "Day-trade exit guard triggered"
        );
        opts.emit?.("exit_guard", {
          symbol: pos.symbol,
          exit: decision.exit,
          unrealizedPct: Math.round(decision.unrealizedPct * 100) / 100,
        });
        const placed = await executeRealTrades({
          symbol: pos.symbol,
          assetType: asset.assetType,
          side: "sell",
          notionalHint,
          onlyUserId: userId,
          exitGuard: decision.exit,
          strategy: "daytrade",
        });
        exits += placed;
      }
    }
  } catch (err) {
    logger.error({ err }, "Day-trade exit guards failed");
  }
  return exits;
}
