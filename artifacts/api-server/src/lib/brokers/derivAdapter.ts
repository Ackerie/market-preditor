import { and, eq, sql } from "drizzle-orm";
import { db, derivConnectionsTable } from "@workspace/db";
import { ALL_ASSETS, type CoinData } from "../coins";
import { decryptCredential } from "../credentialCrypto";
import {
  DerivError,
  derivBalance,
  derivBuyMultiplier,
  derivCandles,
  derivPortfolio,
  derivProfitTable,
  derivProposal,
  derivSellContract,
  type DerivConn,
} from "../deriv";
import type {
  AutoTradeAccount,
  BrokerAdapter,
  BrokerCredentials,
  MarketBar,
  MarketQuote,
  NormalizedHolding,
  NormalizedTrade,
  PlaceOrderResult,
  ResolvedConnection,
  SellablePosition,
  SymbolRoute,
  Tradeability,
} from "./types";

/**
 * Internal symbols Deriv can serve as multiplier contracts. Multipliers are
 * leveraged contracts (stake-based, auto stop-out) rather than spot — buys
 * open a MULTUP contract and sells close the user's open contracts on the
 * underlying. Extend this map as Deriv adds underlyings.
 */
const DERIV_SYMBOLS: Record<string, string> = {
  BTC: "cryBTCUSD",
  ETH: "cryETHUSD",
  EURUSD: "frxEURUSD",
  GBPUSD: "frxGBPUSD",
  USDJPY: "frxUSDJPY",
  AUDUSD: "frxAUDUSD",
  USDCAD: "frxUSDCAD",
  USDCHF: "frxUSDCHF",
  NZDUSD: "frxNZDUSD",
  XAUUSD: "frxXAUUSD",
};

/** Default leverage for multiplier contracts opened by this adapter. */
const DERIV_MULTIPLIER = 20;

const BAR_GRANULARITY_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "1d": 86400,
};

function num(value: unknown): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAsset(symbol: string): CoinData | undefined {
  return ALL_ASSETS.find((asset) => asset.symbol === symbol);
}

/** Internal asset for a Deriv underlying (e.g. cryBTCUSD -> BTC). */
export function assetForDerivSymbol(
  brokerSymbol: string,
): CoinData | undefined {
  const internal = Object.entries(DERIV_SYMBOLS).find(
    ([, derivSymbol]) => derivSymbol === brokerSymbol,
  )?.[0];
  return internal ? getAsset(internal) : undefined;
}

function connFromRow(row: typeof derivConnectionsTable.$inferSelect): DerivConn {
  return {
    apiToken: decryptCredential(row.apiToken),
    mode: row.mode,
    loginId: row.loginId,
  };
}

function isMarketClosedError(error: DerivError): boolean {
  return /market.*(closed|close)/i.test(error.code) ||
    /market.*(closed|close)/i.test(error.message);
}

export const derivAdapter: BrokerAdapter = {
  id: "deriv",
  displayName: "Deriv",

  routeSymbol(symbol: string, assetType: string): SymbolRoute | null {
    if (assetType !== "crypto" && assetType !== "forex") return null;
    const derivSymbol = DERIV_SYMBOLS[symbol];
    if (!derivSymbol) return null;
    return {
      brokerSymbol: derivSymbol,
      effectiveAssetType: assetType,
      note: "Executes as a Deriv multiplier contract",
    };
  },

  assetForBrokerSymbol: assetForDerivSymbol,

  async getConnection(userId: string): Promise<ResolvedConnection | undefined> {
    const [row] = await db
      .select()
      .from(derivConnectionsTable)
      .where(eq(derivConnectionsTable.userId, userId));
    if (!row) return undefined;
    return { creds: connFromRow(row), mode: row.mode };
  },

  async listAutoTradeAccounts(
    onlyUserId?: string,
  ): Promise<AutoTradeAccount[]> {
    const rows = await db
      .select()
      .from(derivConnectionsTable)
      .where(
        onlyUserId
          ? and(
              eq(derivConnectionsTable.autoTradeEnabled, true),
              eq(derivConnectionsTable.userId, onlyUserId),
            )
          : eq(derivConnectionsTable.autoTradeEnabled, true),
      );
    return rows.map((row) => ({
      rowId: row.id,
      userId: row.userId,
      mode: row.mode,
      maxPerTradeUsd: num(row.autoTradeMaxUsd),
      dailyLimitUsd: num(row.autoTradeDailyLimitUsd),
      spentTodayUsd: num(row.spentTodayUsd),
      spendDate: row.spendDate,
      creds: connFromRow(row),
    }));
  },

  async reserveDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<boolean> {
    const effectiveSpent = sql`CASE WHEN ${derivConnectionsTable.spendDate} = ${today} THEN ${derivConnectionsTable.spentTodayUsd} ELSE 0 END`;
    const reserved = await db
      .update(derivConnectionsTable)
      .set({
        spentTodayUsd: sql`${effectiveSpent} + ${notionalUsd.toFixed(2)}`,
        spendDate: today,
      })
      .where(
        and(
          eq(derivConnectionsTable.id, rowId),
          eq(derivConnectionsTable.autoTradeEnabled, true),
          sql`${effectiveSpent} + ${notionalUsd.toFixed(2)} <= ${derivConnectionsTable.autoTradeDailyLimitUsd}`,
        ),
      )
      .returning({ id: derivConnectionsTable.id });
    return reserved.length > 0;
  },

  async refundDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<void> {
    const effectiveSpent = sql`CASE WHEN ${derivConnectionsTable.spendDate} = ${today} THEN ${derivConnectionsTable.spentTodayUsd} ELSE 0 END`;
    await db
      .update(derivConnectionsTable)
      .set({
        spentTodayUsd: sql`GREATEST(${effectiveSpent} - ${notionalUsd.toFixed(2)}, 0)`,
        spendDate: today,
      })
      .where(eq(derivConnectionsTable.id, rowId));
  },

  async checkTradeability(
    creds: BrokerCredentials,
    brokerSymbol: string,
  ): Promise<Tradeability> {
    try {
      await derivProposal(creds as DerivConn, {
        symbol: brokerSymbol,
        stakeUsd: 1,
        multiplier: DERIV_MULTIPLIER,
      });
      return { tradeable: true };
    } catch (error) {
      if (error instanceof DerivError && isMarketClosedError(error)) {
        return { tradeable: false, reason: "market_closed" };
      }
      return { tradeable: false, reason: "not_tradeable" };
    }
  },

  async getAvailableCashUsd(creds: BrokerCredentials): Promise<number | null> {
    try {
      const { balance } = await derivBalance(creds as DerivConn);
      return balance;
    } catch {
      return null;
    }
  },

  /** Deriv multiplier minimum stake is ~$1 on USD accounts. */
  minOrderNotionalUsd(): number {
    return 1;
  },

  async getSellablePosition(
    creds: BrokerCredentials,
    brokerSymbol: string,
  ): Promise<SellablePosition | null> {
    try {
      const contracts = await derivPortfolio(creds as DerivConn);
      const open = contracts.filter(
        (c) =>
          c.underlying === brokerSymbol && c.contractType.startsWith("MULT"),
      );
      if (open.length === 0) return null;
      const marketValueUsd = open.reduce((total, c) => total + c.bidPrice, 0);
      return { marketValueUsd };
    } catch {
      return null;
    }
  },

  async placeMarketOrder(
    creds: BrokerCredentials,
    opts: {
      brokerSymbol: string;
      side: "buy" | "sell";
      notionalUsd: number;
      qty?: string;
      effectiveAssetType: string;
    },
  ): Promise<PlaceOrderResult> {
    const conn = creds as DerivConn;
    try {
      if (opts.side === "buy") {
        const bought = await derivBuyMultiplier(conn, {
          symbol: opts.brokerSymbol,
          stakeUsd: opts.notionalUsd,
          multiplier: DERIV_MULTIPLIER,
        });
        return {
          ok: true,
          status: 200,
          rejectReason: null,
          orderId: String(bought.contractId),
          fillPrice: bought.buyPrice > 0 ? bought.buyPrice : undefined,
          orderStatus: "filled",
        };
      }

      // Sells close every open multiplier contract on the underlying
      // (full-position exit; Deriv has no partial notional sells).
      const contracts = await derivPortfolio(conn);
      const open = contracts.filter(
        (c) =>
          c.underlying === opts.brokerSymbol &&
          c.contractType.startsWith("MULT"),
      );
      if (open.length === 0) {
        return {
          ok: false,
          status: 400,
          rejectReason: "No open Deriv multiplier contract on this instrument",
        };
      }
      let soldTotal = 0;
      const soldIds: string[] = [];
      for (const contract of open) {
        soldTotal += await derivSellContract(conn, contract.contractId, 0);
        soldIds.push(String(contract.contractId));
      }
      return {
        ok: true,
        status: 200,
        rejectReason: null,
        orderId: soldIds.join(","),
        fillQty: open.length,
        fillPrice: soldTotal > 0 ? soldTotal : undefined,
        orderStatus: "filled",
      };
    } catch (error) {
      return {
        ok: false,
        status: 400,
        rejectReason:
          error instanceof Error ? error.message : "Deriv rejected the order",
      };
    }
  },

  async getBalances(creds: BrokerCredentials) {
    try {
      const conn = creds as DerivConn;
      const [{ balance }, contracts] = await Promise.all([
        derivBalance(conn),
        derivPortfolio(conn),
      ]);
      const openValue = contracts.reduce((total, c) => total + c.bidPrice, 0);
      return { cashUsd: balance, equityUsd: balance + openValue };
    } catch {
      return null;
    }
  },

  async getHoldings(creds: BrokerCredentials): Promise<NormalizedHolding[]> {
    try {
      const contracts = await derivPortfolio(creds as DerivConn);
      return contracts
        .filter((c) => c.contractType.startsWith("MULT"))
        .map((c) => {
          const asset = assetForDerivSymbol(c.underlying);
          return {
            symbol: asset?.symbol ?? c.underlying,
            name: asset?.name ?? c.shortcode,
            quantity: 1,
            avgBuyPrice: c.buyPrice,
            currentPrice: c.bidPrice,
            currentValue: c.bidPrice,
            pnl: c.bidPrice - c.buyPrice,
            pnlPercent:
              c.buyPrice > 0
                ? ((c.bidPrice - c.buyPrice) / c.buyPrice) * 100
                : 0,
            logoUrl: asset?.logoUrl ?? "",
            broker: "deriv",
          };
        });
    } catch {
      return [];
    }
  },

  async getRecentTrades(
    creds: BrokerCredentials,
    limit: number,
  ): Promise<NormalizedTrade[]> {
    try {
      const entries = await derivProfitTable(creds as DerivConn, limit);
      return entries.map((entry) => {
        const asset = assetForDerivSymbol(entry.underlying);
        return {
          id: String(entry.contractId),
          symbol: asset?.symbol ?? entry.underlying,
          name: asset?.name ?? entry.shortcode,
          side: "buy" as const,
          quantity: 1,
          price: entry.buyPrice,
          total: entry.buyPrice,
          createdAt: entry.purchaseTime
            ? new Date(entry.purchaseTime * 1000).toISOString()
            : "",
          logoUrl: asset?.logoUrl ?? "",
          broker: "deriv",
          status: entry.sellTime > 0 ? "closed" : "open",
        };
      });
    } catch {
      return [];
    }
  },

  async getMarketQuotes(
    creds: BrokerCredentials,
    assets: CoinData[],
  ): Promise<MarketQuote[]> {
    const servable = assets.filter((asset) => DERIV_SYMBOLS[asset.symbol]);
    const results = await Promise.allSettled(
      servable.map(async (asset) => {
        const candles = await derivCandles(
          creds as DerivConn,
          DERIV_SYMBOLS[asset.symbol],
          86400,
          2,
        );
        const latest = candles[candles.length - 1];
        if (!latest || latest.close <= 0) return null;
        const previous = candles[candles.length - 2];
        const change24h =
          previous && previous.close > 0
            ? ((latest.close - previous.close) / previous.close) * 100
            : 0;
        return {
          symbol: asset.symbol,
          price: latest.close,
          change24h,
          source: "deriv",
        } satisfies MarketQuote;
      }),
    );
    return results.flatMap((r) =>
      r.status === "fulfilled" && r.value ? [r.value] : [],
    );
  },

  async getMarketBars(
    creds: BrokerCredentials,
    brokerSymbol: string,
    timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
    limit: number,
  ): Promise<MarketBar[] | null> {
    const granularity = BAR_GRANULARITY_SECONDS[timeframe];
    if (!granularity) return null;
    try {
      const candles = await derivCandles(
        creds as DerivConn,
        brokerSymbol,
        granularity,
        limit,
      );
      if (candles.length === 0) return null;
      return candles.map((c) => ({
        time: new Date(c.epoch * 1000).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
    } catch {
      return null;
    }
  },
};
