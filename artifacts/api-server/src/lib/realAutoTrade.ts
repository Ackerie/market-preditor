import { and, eq, gt, lt } from "drizzle-orm";
import {
  db,
  autoTradeEventsTable,
  autoTradeNotificationsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { listBrokers, type BrokerAdapter } from "./brokers";
import { notifyAutoTradeIssue } from "./autoTradeNotify";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Retention policy: auto-trade events older than this many days are pruned so
// the table stays bounded even in continuous run mode. The activity feed shows
// recent events and alert dedupe only looks back 24h, so 30 days is plenty.
const EVENT_RETENTION_DAYS = 30;
// Alert-dedupe rows are only meaningful for the current UTC day (the dedupe
// key embeds the date), so anything older than a few days is dead weight.
const NOTIFICATION_RETENTION_DAYS = 3;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // at most once per hour
// Skip an order when the opposite side of the same symbol executed for the
// same user within this window — brokers (notably Alpaca) reject these as
// potential wash trades.
const WASH_TRADE_WINDOW_MS = 2 * 60 * 1000;
let lastPruneAt = 0;

/**
 * Delete auto-trade events and alert-dedupe records older than their
 * retention windows. Throttled to run at most once per hour; safe to call at
 * the start of every trading cycle.
 * Never throws — pruning failures must not block trading.
 */
export async function pruneOldAutoTradeEvents(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  try {
    const cutoff = new Date(now - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db
      .delete(autoTradeEventsTable)
      .where(lt(autoTradeEventsTable.createdAt, cutoff));
  } catch (err) {
    logger.error({ err }, "Failed to prune old auto-trade events");
  }
  try {
    const cutoff = new Date(
      now - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    await db
      .delete(autoTradeNotificationsTable)
      .where(lt(autoTradeNotificationsTable.sentAt, cutoff));
  } catch (err) {
    logger.error(
      { err },
      "Failed to prune old auto-trade alert-dedupe records",
    );
  }
}

async function recordEvent(event: {
  userId: string;
  broker: string;
  symbol: string;
  side: "buy" | "sell";
  notionalUsd: number;
  outcome: "executed" | "skipped" | "rejected";
  reasonCode?:
    | "daily_limit"
    | "no_position"
    | "broker_rejected"
    | "insufficient_cash"
    | "market_closed"
    | "not_tradeable"
    | "too_small"
    | "wash_trade"
    | "error";
  message?: string;
  quantity?: number;
  fillPrice?: number;
  strategy?: "longterm" | "daytrade";
}) {
  try {
    await db.insert(autoTradeEventsTable).values({
      userId: event.userId,
      broker: event.broker,
      symbol: event.symbol,
      side: event.side,
      notionalUsd: event.notionalUsd.toFixed(2),
      outcome: event.outcome,
      reasonCode: event.reasonCode ?? null,
      message: event.message ?? null,
      quantity:
        event.quantity != null && Number.isFinite(event.quantity)
          ? String(event.quantity)
          : null,
      fillPrice:
        event.fillPrice != null && Number.isFinite(event.fillPrice)
          ? String(event.fillPrice)
          : null,
      strategy: event.strategy ?? "longterm",
    });
  } catch (err) {
    logger.error(
      { err, userId: event.userId },
      "Failed to record auto-trade event",
    );
  }
  // Out-of-app notification (email) for rejections and daily-cap hits.
  // Deduplicated internally; never blocks or fails the trading cycle.
  try {
    await notifyAutoTradeIssue(event);
  } catch (err) {
    logger.error(
      { err, userId: event.userId },
      "Failed to dispatch auto-trade notification",
    );
  }
}

export interface RealTradeSignal {
  symbol: string;
  assetType: string;
  side: "buy" | "sell";
  notionalHint: number;
  /** Limit execution to a single opted-in user (used by day-trade exit guards). */
  onlyUserId?: string;
  /**
   * Day-trade exit guard sell: bypasses the per-trade cap and daily spend
   * limit (a protective sell frees cash rather than spending it) and tags
   * the event so the activity feed shows why the bot exited.
   */
  exitGuard?: "take_profit" | "stop_loss";
  /** Which bot mode placed this trade (tags recorded events). Default "longterm". */
  strategy?: "longterm" | "daytrade";
}

/**
 * Execute an AI trade signal on the real accounts of every user who opted in
 * to auto-trading, respecting per-trade and daily caps. The instrument is
 * routed to a registered broker adapter (brokers/index.ts); instruments no
 * adapter can trade are skipped. Returns the number of real orders placed.
 */
export async function executeRealTrades(
  signal: RealTradeSignal,
): Promise<number> {
  let placed = 0;
  for (const adapter of listBrokers()) {
    const route = adapter.routeSymbol(signal.symbol, signal.assetType);
    if (!route) continue;
    placed += await executeTradesOnBroker(
      adapter,
      signal,
      route.brokerSymbol,
      route.effectiveAssetType,
    );
  }
  return placed;
}

/**
 * Broker-generic auto-trade executor. All broker specifics live behind the
 * BrokerAdapter interface; the safety rails here are identical for every
 * broker:
 * - Day-trading budget model: the daily limit is an allotment of capital for
 *   BUYS. Sells free capital, so they never consume budget, and an executed
 *   sell refunds today's spend — letting the bot re-deploy the same
 *   allotment on new entries until the UTC day resets.
 * - Budget is reserved atomically BEFORE ordering and refunded on rejection.
 * - Sells bypass the per-trade cap (a capped sell could force only a partial
 *   exit) but are capped at the actual position value on the broker.
 * - Buys are capped by the broker's actual available cash.
 * - Near-full-position sells use broker-native qty when the adapter provides
 *   it (avoids price-drift "insufficient balance" rejections).
 */
async function executeTradesOnBroker(
  adapter: BrokerAdapter,
  signal: RealTradeSignal,
  brokerSymbol: string,
  effectiveAssetType: string,
): Promise<number> {
  const isSell = signal.side === "sell";
  const accounts = await adapter.listAutoTradeAccounts(signal.onlyUserId);

  let placed = 0;
  for (const account of accounts) {
    try {
      // Skip instruments that cannot trade right now (closed market or not
      // offered to this account) instead of sending doomed orders.
      const tradability = await adapter.checkTradeability(
        account.creds,
        brokerSymbol,
      );
      if (!tradability.tradeable) {
        const closed = tradability.reason === "market_closed";
        logger.info(
          {
            userId: account.userId,
            broker: adapter.id,
            brokerSymbol,
            side: signal.side,
            strategy: signal.strategy,
            reason: tradability.reason,
          },
          "Real auto-trade skipped: instrument not tradeable right now",
        );
        await recordEvent({
          userId: account.userId,
          broker: adapter.id,
          symbol: signal.symbol,
          side: signal.side,
          strategy: signal.strategy,
          notionalUsd: 0,
          outcome: "skipped",
          reasonCode: tradability.reason ?? "not_tradeable",
          message: closed
            ? "Skipped — the market for this instrument is closed right now (forex and CFD markets close on weekends)"
            : `Skipped — this instrument is not tradeable by your ${adapter.displayName} account`,
        });
        continue;
      }

      // Wash-trade guard: brokers (notably Alpaca) reject an order when the
      // opposite side of the same symbol traded moments earlier for the same
      // account (e.g. the long-term and day-trade bots disagreeing). Skip
      // instead of submitting a doomed order. Exit-guard sells (take-profit /
      // stop-loss) always go through.
      if (!signal.exitGuard) {
        const oppositeSide = isSell ? "buy" : "sell";
        const washCutoff = new Date(Date.now() - WASH_TRADE_WINDOW_MS);
        const recentOpposite = await db
          .select({ id: autoTradeEventsTable.id })
          .from(autoTradeEventsTable)
          .where(
            and(
              eq(autoTradeEventsTable.userId, account.userId),
              eq(autoTradeEventsTable.broker, adapter.id),
              eq(autoTradeEventsTable.symbol, signal.symbol),
              eq(autoTradeEventsTable.side, oppositeSide),
              eq(autoTradeEventsTable.outcome, "executed"),
              gt(autoTradeEventsTable.createdAt, washCutoff),
            ),
          )
          .limit(1);
        if (recentOpposite.length > 0) {
          logger.info(
            {
              userId: account.userId,
              broker: adapter.id,
              symbol: signal.symbol,
              side: signal.side,
              strategy: signal.strategy,
            },
            "Real auto-trade skipped: opposite side traded moments ago (wash-trade guard)",
          );
          await recordEvent({
            userId: account.userId,
            broker: adapter.id,
            symbol: signal.symbol,
            side: signal.side,
            strategy: signal.strategy,
            notionalUsd: 0,
            outcome: "skipped",
            reasonCode: "wash_trade",
            message: `Skipped — a ${oppositeSide} of this asset executed moments ago; placing the opposite order now would be rejected as a wash trade`,
          });
          continue;
        }
      }

      const today = todayUtc();
      const spentToday =
        account.spendDate === today ? account.spentTodayUsd : 0;
      const remaining = account.dailyLimitUsd - spentToday;
      // Sells free cash rather than spend it, so they bypass the daily
      // spend limit (and the per-trade cap — see below).
      if (!isSell && remaining < 1) {
        logger.info(
          { userId: account.userId, broker: adapter.id, symbol: signal.symbol },
          "Real auto-trade skipped: daily limit reached",
        );
        await recordEvent({
          userId: account.userId,
          broker: adapter.id,
          symbol: signal.symbol,
          side: signal.side,
          strategy: signal.strategy,
          notionalUsd: 0,
          outcome: "skipped",
          reasonCode: "daily_limit",
          message: `Daily limit of $${account.dailyLimitUsd.toFixed(2)} reached ($${spentToday.toFixed(2)} spent today)`,
        });
        continue;
      }

      // Sells never spend money, so the per-trade cap does not apply — a
      // capped sell could force only a partial exit from a losing position.
      // Sells are capped at the actual position value below.
      let notional = isSell
        ? Math.max(1, signal.notionalHint)
        : Math.min(
            account.maxPerTradeUsd,
            remaining,
            Math.max(1, signal.notionalHint),
          );
      let sellQty: string | undefined;

      if (signal.side === "buy") {
        // Fund buys from the account's actual available cash on the broker.
        const availableCash = await adapter.getAvailableCashUsd(
          account.creds,
          effectiveAssetType,
        );
        if (availableCash == null) {
          logger.warn(
            {
              userId: account.userId,
              broker: adapter.id,
              symbol: signal.symbol,
            },
            "Real auto-trade buy skipped: could not read available cash",
          );
          await recordEvent({
            userId: account.userId,
            broker: adapter.id,
            symbol: signal.symbol,
            side: signal.side,
            strategy: signal.strategy,
            notionalUsd: 0,
            outcome: "skipped",
            reasonCode: "error",
            message: `Buy skipped — could not read available cash from ${adapter.displayName}`,
          });
          continue;
        }
        notional = Math.min(notional, Math.floor(availableCash * 100) / 100);
        if (notional < 1) {
          logger.info(
            {
              userId: account.userId,
              broker: adapter.id,
              symbol: signal.symbol,
              availableCash,
            },
            "Real auto-trade buy skipped: insufficient cash",
          );
          await recordEvent({
            userId: account.userId,
            broker: adapter.id,
            symbol: signal.symbol,
            side: signal.side,
            strategy: signal.strategy,
            notionalUsd: 0,
            outcome: "skipped",
            reasonCode: "insufficient_cash",
            message: `Buy skipped — only $${availableCash.toFixed(2)} available on ${adapter.displayName}`,
          });
          continue;
        }
        // Broker minimum order size (e.g. Alpaca crypto: $10). Skip instead
        // of submitting an order the broker will reject.
        const minNotional =
          adapter.minOrderNotionalUsd?.(effectiveAssetType) ?? 1;
        if (notional < minNotional) {
          logger.info(
            {
              userId: account.userId,
              broker: adapter.id,
              symbol: signal.symbol,
              notional,
              minNotional,
            },
            "Real auto-trade buy skipped: below broker minimum order size",
          );
          await recordEvent({
            userId: account.userId,
            broker: adapter.id,
            symbol: signal.symbol,
            side: signal.side,
            strategy: signal.strategy,
            notionalUsd: notional,
            outcome: "skipped",
            reasonCode: "too_small",
            message: `Buy skipped — $${notional.toFixed(2)} is below ${adapter.displayName}'s $${minNotional.toFixed(2)} minimum order for this asset`,
          });
          continue;
        }
      }

      if (signal.side === "sell") {
        const position = await adapter.getSellablePosition(
          account.creds,
          brokerSymbol,
          effectiveAssetType,
        );
        if (!position || position.marketValueUsd <= 0) {
          logger.info(
            {
              userId: account.userId,
              broker: adapter.id,
              symbol: signal.symbol,
            },
            "Real auto-trade sell skipped: no position",
          );
          await recordEvent({
            userId: account.userId,
            broker: adapter.id,
            symbol: signal.symbol,
            side: signal.side,
            strategy: signal.strategy,
            notionalUsd: 0,
            outcome: "skipped",
            reasonCode: "no_position",
            message: "Sell skipped — no open position in this asset",
          });
          continue;
        }
        notional = Math.min(
          notional,
          Math.floor(position.marketValueUsd * 100) / 100,
        );
        if (notional < 1) continue;
        // Selling (nearly) the whole position by dollar amount is fragile:
        // price drift between the position check and the order can request
        // slightly more than is held ("insufficient balance"). Sell by
        // quantity instead when the notional covers ~the full position and
        // the broker supports qty exits.
        if (
          position.qtyAvailable &&
          notional >= position.marketValueUsd * 0.98
        ) {
          sellQty = position.qtyAvailable;
        }
      }

      notional = Math.round(notional * 100) / 100;

      // Atomically reserve budget BEFORE placing the order (guarded UPDATE in
      // the adapter rejects the reservation if a concurrent run already used
      // the budget). Sells skip the reservation — they don't spend budget.
      const reserved = isSell
        ? true
        : await adapter.reserveDailyBudget(account.rowId, today, notional);
      if (!reserved) {
        logger.info(
          { userId: account.userId, broker: adapter.id, symbol: signal.symbol },
          "Real auto-trade skipped: daily limit reached (concurrent)",
        );
        await recordEvent({
          userId: account.userId,
          broker: adapter.id,
          symbol: signal.symbol,
          side: signal.side,
          strategy: signal.strategy,
          notionalUsd: notional,
          outcome: "skipped",
          reasonCode: "daily_limit",
          message: `Trade of $${notional.toFixed(2)} would exceed the daily limit of $${account.dailyLimitUsd.toFixed(2)}`,
        });
        continue;
      }

      const result = await adapter.placeMarketOrder(account.creds, {
        brokerSymbol,
        side: signal.side,
        notionalUsd: notional,
        qty: sellQty,
        effectiveAssetType,
      });

      if (!result.ok) {
        // Refund the reservation since no order was placed.
        if (!isSell)
          await adapter.refundDailyBudget(account.rowId, today, notional);
        logger.warn(
          {
            userId: account.userId,
            broker: adapter.id,
            brokerSymbol,
            side: signal.side,
            strategy: signal.strategy,
            status: result.status,
            reason: result.rejectReason,
          },
          "Real auto-trade order rejected by broker",
        );
        await recordEvent({
          userId: account.userId,
          broker: adapter.id,
          symbol: signal.symbol,
          side: signal.side,
          strategy: signal.strategy,
          notionalUsd: notional,
          outcome: "rejected",
          reasonCode: "broker_rejected",
          message: result.rejectReason
            ? `${adapter.displayName} rejected the order: ${result.rejectReason}`
            : `${adapter.displayName} rejected the order (HTTP ${result.status})`,
        });
        continue;
      }

      placed++;
      logger.info(
        {
          userId: account.userId,
          broker: adapter.id,
          brokerSymbol,
          side: signal.side,
          strategy: signal.strategy,
          notional,
          mode: account.mode,
        },
        "Real auto-trade order placed",
      );
      // An executed sell frees capital: refund today's spend so the bot can
      // re-deploy the daily allotment on new buys (never below zero).
      if (isSell)
        await adapter.refundDailyBudget(account.rowId, today, notional);
      await recordEvent({
        userId: account.userId,
        broker: adapter.id,
        symbol: signal.symbol,
        side: signal.side,
        strategy: signal.strategy,
        notionalUsd: notional,
        outcome: "executed",
        message: signal.exitGuard
          ? `Sold $${notional.toFixed(2)} on ${adapter.displayName} (${account.mode}) — ${signal.exitGuard === "take_profit" ? "take-profit" : "stop-loss"} exit`
          : `${signal.side === "buy" ? "Bought" : "Sold"} $${notional.toFixed(2)} on ${adapter.displayName} (${account.mode})`,
        quantity: result.fillQty,
        fillPrice: result.fillPrice,
      });
    } catch (err) {
      logger.error(
        {
          err,
          userId: account.userId,
          broker: adapter.id,
          symbol: signal.symbol,
        },
        "Real auto-trade failed",
      );
      await recordEvent({
        userId: account.userId,
        broker: adapter.id,
        symbol: signal.symbol,
        side: signal.side,
        strategy: signal.strategy,
        notionalUsd: 0,
        outcome: "rejected",
        reasonCode: "error",
        message: "Broker connection failed — the order could not be placed",
      });
    }
  }
  return placed;
}
