import { and, eq, sql } from "drizzle-orm";
import { db, oandaConnectionsTable } from "@workspace/db";
import {
  oanda,
  oandaMarketOrderNotional,
  oandaRejectReason,
  oandaTradeability,
  isAccountRestrictedReject,
  markOandaInstrumentUntradeable,
  toOandaInstrument,
  type OandaConn,
} from "../oanda";
import { ALL_ASSETS, type CoinData } from "../coins";
import { decryptCredential } from "../credentialCrypto";
import type {
  AutoTradeAccount,
  BrokerAdapter,
  BrokerCredentials,
  NormalizedHolding,
  NormalizedTrade,
  PlaceOrderResult,
  ResolvedConnection,
  SellablePosition,
  SymbolRoute,
  Tradeability,
  MarketBar,
  MarketQuote,
} from "./types";

function num(v: unknown): number {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

let reverseOandaMap: Map<string, CoinData> | null = null;

/** Internal asset for an OANDA instrument (e.g. EUR_USD -> EURUSD). */
export function assetForOandaInstrument(
  instrument: string,
): CoinData | undefined {
  if (!reverseOandaMap) {
    reverseOandaMap = new Map();
    for (const a of ALL_ASSETS) {
      const inst = toOandaInstrument(a.symbol, a.assetType);
      if (inst) reverseOandaMap.set(inst, a);
    }
  }
  return reverseOandaMap.get(instrument);
}

export const oandaAdapter: BrokerAdapter = {
  id: "oanda",
  displayName: "OANDA",

  routeSymbol(symbol: string, assetType: string): SymbolRoute | null {
    if (assetType === "forex" || assetType === "commodity") {
      const inst = toOandaInstrument(symbol, assetType);
      return inst
        ? { brokerSymbol: inst, effectiveAssetType: assetType }
        : null;
    }
    if (assetType === "futures") {
      const inst = toOandaInstrument(symbol, "futures");
      if (inst)
        return {
          brokerSymbol: inst,
          effectiveAssetType: "futures",
          note: "Executes as an OANDA index CFD",
        };
    }
    return null;
  },

  assetForBrokerSymbol: assetForOandaInstrument,

  async getConnection(userId: string): Promise<ResolvedConnection | undefined> {
    const [row] = await db
      .select()
      .from(oandaConnectionsTable)
      .where(eq(oandaConnectionsTable.userId, userId));
    if (!row) return undefined;
    const creds: OandaConn = {
      apiToken: decryptCredential(row.apiToken),
      accountId: row.accountId,
      mode: row.mode,
    };
    return { creds, mode: row.mode };
  },

  async listAutoTradeAccounts(
    onlyUserId?: string,
  ): Promise<AutoTradeAccount[]> {
    const rows = await db
      .select()
      .from(oandaConnectionsTable)
      .where(
        onlyUserId
          ? and(
              eq(oandaConnectionsTable.autoTradeEnabled, true),
              eq(oandaConnectionsTable.userId, onlyUserId),
            )
          : eq(oandaConnectionsTable.autoTradeEnabled, true),
      );
    return rows.map((row) => ({
      rowId: row.id,
      userId: row.userId,
      mode: row.mode,
      maxPerTradeUsd: parseFloat(row.autoTradeMaxUsd),
      dailyLimitUsd: parseFloat(row.autoTradeDailyLimitUsd),
      spentTodayUsd: parseFloat(row.spentTodayUsd),
      spendDate: row.spendDate,
      creds: {
        apiToken: decryptCredential(row.apiToken),
        accountId: row.accountId,
        mode: row.mode,
      } satisfies OandaConn,
    }));
  },

  async reserveDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<boolean> {
    const effectiveSpent = sql`CASE WHEN ${oandaConnectionsTable.spendDate} = ${today} THEN ${oandaConnectionsTable.spentTodayUsd} ELSE 0 END`;
    const reserved = await db
      .update(oandaConnectionsTable)
      .set({
        spentTodayUsd: sql`${effectiveSpent} + ${notionalUsd.toFixed(2)}`,
        spendDate: today,
      })
      .where(
        and(
          eq(oandaConnectionsTable.id, rowId),
          eq(oandaConnectionsTable.autoTradeEnabled, true),
          sql`${effectiveSpent} + ${notionalUsd.toFixed(2)} <= ${oandaConnectionsTable.autoTradeDailyLimitUsd}`,
        ),
      )
      .returning({ id: oandaConnectionsTable.id });
    return reserved.length > 0;
  },

  async refundDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<void> {
    const effectiveSpent = sql`CASE WHEN ${oandaConnectionsTable.spendDate} = ${today} THEN ${oandaConnectionsTable.spentTodayUsd} ELSE 0 END`;
    await db
      .update(oandaConnectionsTable)
      .set({
        spentTodayUsd: sql`GREATEST(${effectiveSpent} - ${notionalUsd.toFixed(2)}, 0)`,
        spendDate: today,
      })
      .where(eq(oandaConnectionsTable.id, rowId));
  },

  async checkTradeability(
    creds: BrokerCredentials,
    brokerSymbol: string,
  ): Promise<Tradeability> {
    const conn = creds as OandaConn;
    const t = await oandaTradeability(conn, brokerSymbol);
    if (t.tradeable) return { tradeable: true };
    return { tradeable: false, reason: t.reason };
  },

  async getAvailableCashUsd(creds: BrokerCredentials): Promise<number | null> {
    const conn = creds as OandaConn;
    const summary = await oanda(conn, `/v3/accounts/${conn.accountId}/summary`);
    if (!summary.ok) return null;
    return (
      parseFloat(String(summary.data?.account?.marginAvailable ?? "0")) || 0
    );
  },

  async getSellablePosition(
    creds: BrokerCredentials,
    brokerSymbol: string,
  ): Promise<SellablePosition | null> {
    const conn = creds as OandaConn;
    // Only reduce if the user has a long position in this instrument.
    const pos = await oanda(
      conn,
      `/v3/accounts/${conn.accountId}/positions/${brokerSymbol}`,
    );
    const longUnits = parseFloat(
      String(pos.data?.position?.long?.units ?? "0"),
    );
    if (!pos.ok || longUnits <= 0) return null;
    const avgPrice = parseFloat(
      String(pos.data?.position?.long?.averagePrice ?? "0"),
    );
    // OANDA sells are always notional-converted-to-units; no qty exits.
    return { marketValueUsd: longUnits * avgPrice };
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
    const conn = creds as OandaConn;
    const result = await oandaMarketOrderNotional(
      conn,
      opts.brokerSymbol,
      opts.side,
      opts.notionalUsd,
    );
    if (!result.ok) {
      const reason = oandaRejectReason(result.data);
      // Account-level restriction (instrument not offered to this account) —
      // remember it so future cycles skip instead of retrying doomed orders.
      if (isAccountRestrictedReject(reason))
        markOandaInstrumentUntradeable(conn, opts.brokerSymbol);
      return { ok: false, status: result.status, rejectReason: reason };
    }
    const fill = result.data?.orderFillTransaction;
    const fillQty = Math.abs(parseFloat(String(fill?.units ?? "")));
    const fillPrice = parseFloat(String(fill?.price ?? ""));
    return {
      ok: true,
      status: result.status,
      rejectReason: null,
      orderId: String(fill?.id ?? result.data?.lastTransactionID ?? ""),
      fillQty: Number.isFinite(fillQty) && fillQty > 0 ? fillQty : undefined,
      fillPrice:
        Number.isFinite(fillPrice) && fillPrice > 0 ? fillPrice : undefined,
      fillTime: fill?.time ?? undefined,
      orderStatus: fill ? "filled" : "accepted",
    };
  },

  async getBalances(creds: BrokerCredentials) {
    const conn = creds as OandaConn;
    const account = await oanda(conn, `/v3/accounts/${conn.accountId}/summary`);
    if (!account.ok) return null;
    return {
      cashUsd: num(account.data?.account?.balance),
      equityUsd: num(account.data?.account?.NAV),
    };
  },

  async getHoldings(creds: BrokerCredentials): Promise<NormalizedHolding[]> {
    const conn = creds as OandaConn;
    const positions = await oanda(
      conn,
      `/v3/accounts/${conn.accountId}/openPositions`,
    );
    if (!positions.ok || !Array.isArray(positions.data?.positions)) return [];
    const holdings: NormalizedHolding[] = [];
    for (const p of positions.data.positions) {
      for (const sideKey of ["long", "short"] as const) {
        const legRaw = p[sideKey];
        if (!legRaw) continue;
        const units = num(legRaw.units);
        if (units === 0) continue;
        const avgPrice = num(legRaw.averagePrice);
        const pnl = num(legRaw.unrealizedPL);
        const qty = Math.abs(units);
        const invested = qty * avgPrice;
        const currentValue = invested + pnl;
        const currentPrice = qty > 0 ? currentValue / qty : avgPrice;
        const asset = assetForOandaInstrument(p.instrument);
        holdings.push({
          symbol: asset?.symbol ?? p.instrument,
          name: asset?.name ?? p.instrument,
          quantity: units,
          avgBuyPrice: avgPrice,
          currentPrice,
          currentValue,
          pnl,
          pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
          logoUrl: asset?.logoUrl ?? "",
          broker: "oanda",
        });
      }
    }
    return holdings;
  },

  async getRecentTrades(
    creds: BrokerCredentials,
    limit: number,
  ): Promise<NormalizedTrade[]> {
    const conn = creds as OandaConn;
    const result = await oanda(
      conn,
      `/v3/accounts/${conn.accountId}/transactions/sinceid?id=1&type=ORDER_FILL`,
    );
    const fills: any[] = Array.isArray(result.data?.transactions)
      ? result.data.transactions
      : [];
    return fills.slice(-limit).map((t: any) => {
      const asset = assetForOandaInstrument(t.instrument);
      const units = num(t.units);
      const price = num(t.price);
      return {
        id: `oanda-${t.id}`,
        symbol: asset?.symbol ?? t.instrument ?? "",
        name: asset?.name ?? t.instrument ?? "",
        side: units >= 0 ? ("buy" as const) : ("sell" as const),
        quantity: Math.abs(units),
        price,
        total: Math.abs(units) * price,
        createdAt: t.time ?? new Date().toISOString(),
        logoUrl: asset?.logoUrl ?? "",
        broker: "oanda",
        status: "filled",
      };
    });
  },

  async getMarketQuotes(
    creds: BrokerCredentials,
    assets: CoinData[],
  ): Promise<MarketQuote[]> {
    const conn = creds as OandaConn;
    const supported = assets
      .filter(
        (asset) =>
          asset.assetType === "forex" ||
          asset.assetType === "commodity" ||
          asset.assetType === "futures",
      )
      .map((asset) => ({
        asset,
        instrument: toOandaInstrument(asset.symbol, asset.assetType),
      }))
      .filter((item): item is { asset: CoinData; instrument: string } =>
        Boolean(item.instrument),
      );
    return (
      await Promise.all(
        supported.map(async ({ asset, instrument }) => {
          const pricing = await oanda(
            conn,
            `/v3/accounts/${conn.accountId}/pricing?instruments=${encodeURIComponent(instrument)}`,
          );
          const current = pricing.data?.prices?.[0];
          const bid = num(current?.bids?.[0]?.price);
          const ask = num(current?.asks?.[0]?.price);
          const price = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask;
          if (!pricing.ok || price <= 0) return null;
          const candles = await oanda(
            conn,
            `/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=D&count=1&price=M`,
          );
          const open = num(candles.data?.candles?.[0]?.mid?.o);
          return {
            symbol: asset.symbol,
            price,
            change24h: open > 0 ? ((price - open) / open) * 100 : 0,
            source: "oanda",
          } satisfies MarketQuote;
        }),
      )
    ).filter((quote): quote is MarketQuote => quote !== null);
  },

  async getMarketBars(
    creds: BrokerCredentials,
    brokerSymbol: string,
    timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
    limit: number,
  ): Promise<MarketBar[] | null> {
    const conn = creds as OandaConn;
    const granularity =
      timeframe === "1d"
        ? "D"
        : timeframe === "1h"
          ? "H1"
          : timeframe === "15m"
            ? "M15"
            : timeframe === "5m"
              ? "M5"
              : "M1";
    const result = await oanda(
      conn,
      `/v3/instruments/${encodeURIComponent(brokerSymbol)}/candles?granularity=${granularity}&count=${limit}&price=M`,
    );
    if (!result.ok || !Array.isArray(result.data?.candles)) return null;
    return result.data.candles
      .filter((c: any) => c.complete !== false && c.mid)
      .map((c: any) => ({
        time: String(c.time),
        open: num(c.mid.o),
        high: num(c.mid.h),
        low: num(c.mid.l),
        close: num(c.mid.c),
        volume: num(c.volume),
      }))
      .filter(
        (bar: MarketBar) =>
          bar.open > 0 && bar.high > 0 && bar.low > 0 && bar.close > 0,
      );
  },
};
