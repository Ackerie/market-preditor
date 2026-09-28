import { and, eq, sql } from "drizzle-orm";
import { db, brokerConnectionsTable } from "@workspace/db";
import { alpaca, toAlpacaSymbol, type AlpacaConn } from "../alpaca";
import { getCoinBySymbol, type CoinData } from "../coins";
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

/** Internal asset for an Alpaca symbol (e.g. BTCUSD or BTC/USD -> BTC). */
export function assetForAlpacaSymbol(symbol: string): CoinData | undefined {
  const direct = getCoinBySymbol(symbol);
  if (direct) return direct;
  const stripped = symbol.replace("/USD", "").replace(/USD$/, "");
  return getCoinBySymbol(stripped);
}

export const alpacaAdapter: BrokerAdapter = {
  id: "alpaca",
  displayName: "Alpaca",

  routeSymbol(symbol: string, assetType: string): SymbolRoute | null {
    if (assetType === "stock" || assetType === "crypto") {
      const s = toAlpacaSymbol(symbol, assetType);
      return s ? { brokerSymbol: s, effectiveAssetType: assetType } : null;
    }
    if (assetType === "futures") {
      // Crypto perpetuals execute as spot crypto on the underlying.
      if (symbol.endsWith("-PERP")) {
        const underlying = symbol.replace(/-PERP$/, "");
        if (getCoinBySymbol(underlying)?.assetType === "crypto") {
          const spot = toAlpacaSymbol(underlying, "crypto");
          if (!spot) return null;
          return {
            brokerSymbol: spot,
            effectiveAssetType: "crypto",
            note: "Executes as spot crypto on Alpaca",
          };
        }
      }
      // Single-stock futures execute as the underlying stock.
      if (symbol.endsWith("-FUT")) {
        const underlying = symbol.replace(/-FUT$/, "");
        if (getCoinBySymbol(underlying)?.assetType === "stock") {
          return {
            brokerSymbol: underlying,
            effectiveAssetType: "stock",
            note: "Executes as the underlying stock on Alpaca",
          };
        }
      }
      return null;
    }
    return null;
  },

  assetForBrokerSymbol: assetForAlpacaSymbol,

  async getConnection(userId: string): Promise<ResolvedConnection | undefined> {
    const [row] = await db
      .select()
      .from(brokerConnectionsTable)
      .where(eq(brokerConnectionsTable.userId, userId));
    if (!row) return undefined;
    const creds: AlpacaConn = {
      apiKey: decryptCredential(row.apiKey),
      apiSecret: decryptCredential(row.apiSecret),
      mode: row.mode,
    };
    return { creds, mode: row.mode };
  },

  async listAutoTradeAccounts(
    onlyUserId?: string,
  ): Promise<AutoTradeAccount[]> {
    const rows = await db
      .select()
      .from(brokerConnectionsTable)
      .where(
        onlyUserId
          ? and(
              eq(brokerConnectionsTable.autoTradeEnabled, true),
              eq(brokerConnectionsTable.userId, onlyUserId),
            )
          : eq(brokerConnectionsTable.autoTradeEnabled, true),
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
        apiKey: decryptCredential(row.apiKey),
        apiSecret: decryptCredential(row.apiSecret),
        mode: row.mode,
      } satisfies AlpacaConn,
    }));
  },

  async reserveDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<boolean> {
    const effectiveSpent = sql`CASE WHEN ${brokerConnectionsTable.spendDate} = ${today} THEN ${brokerConnectionsTable.spentTodayUsd} ELSE 0 END`;
    const reserved = await db
      .update(brokerConnectionsTable)
      .set({
        spentTodayUsd: sql`${effectiveSpent} + ${notionalUsd.toFixed(2)}`,
        spendDate: today,
      })
      .where(
        and(
          eq(brokerConnectionsTable.id, rowId),
          eq(brokerConnectionsTable.autoTradeEnabled, true),
          sql`${effectiveSpent} + ${notionalUsd.toFixed(2)} <= ${brokerConnectionsTable.autoTradeDailyLimitUsd}`,
        ),
      )
      .returning({ id: brokerConnectionsTable.id });
    return reserved.length > 0;
  },

  async refundDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<void> {
    const effectiveSpent = sql`CASE WHEN ${brokerConnectionsTable.spendDate} = ${today} THEN ${brokerConnectionsTable.spentTodayUsd} ELSE 0 END`;
    await db
      .update(brokerConnectionsTable)
      .set({
        spentTodayUsd: sql`GREATEST(${effectiveSpent} - ${notionalUsd.toFixed(2)}, 0)`,
        spendDate: today,
      })
      .where(eq(brokerConnectionsTable.id, rowId));
  },

  async checkTradeability(): Promise<Tradeability> {
    // Alpaca has no cheap pre-flight tradeability endpoint; rejections are
    // handled on the order path.
    return { tradeable: true };
  },

  minOrderNotionalUsd(effectiveAssetType: string): number {
    // Alpaca rejects crypto orders below $10 ("cost basis must be >= minimal
    // amount of order 10"); stocks accept $1 fractional orders.
    return effectiveAssetType === "crypto" ? 10 : 1;
  },

  async getAvailableCashUsd(
    creds: BrokerCredentials,
    effectiveAssetType: string,
  ): Promise<number | null> {
    const conn = creds as AlpacaConn;
    const acct = await alpaca(conn, "/v2/account");
    if (!acct.ok) return null;
    const raw =
      effectiveAssetType === "crypto"
        ? (acct.data?.non_marginable_buying_power ?? acct.data?.cash)
        : (acct.data?.buying_power ?? acct.data?.cash);
    return parseFloat(String(raw ?? "0")) || 0;
  },

  async getSellablePosition(
    creds: BrokerCredentials,
    brokerSymbol: string,
    effectiveAssetType: string,
  ): Promise<SellablePosition | null> {
    const conn = creds as AlpacaConn;
    const posSymbol =
      effectiveAssetType === "crypto"
        ? `${brokerSymbol.replace("/USD", "")}USD`
        : brokerSymbol;
    const pos = await alpaca(conn, `/v2/positions/${posSymbol}`);
    if (!pos.ok) return null;
    const marketValueUsd =
      parseFloat(String(pos.data?.market_value ?? "0")) || 0;
    const qtyAvailable = String(pos.data?.qty_available ?? pos.data?.qty ?? "");
    return {
      marketValueUsd,
      qtyAvailable:
        qtyAvailable && parseFloat(qtyAvailable) > 0 ? qtyAvailable : undefined,
    };
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
    const conn = creds as AlpacaConn;
    const result = await alpaca(conn, "/v2/orders", {
      method: "POST",
      body: {
        symbol: opts.brokerSymbol,
        side: opts.side,
        ...(opts.qty
          ? { qty: opts.qty }
          : { notional: opts.notionalUsd.toFixed(2) }),
        type: "market",
        time_in_force: opts.effectiveAssetType === "crypto" ? "gtc" : "day",
      },
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        rejectReason:
          typeof result.data?.message === "string" ? result.data.message : null,
      };
    }
    const fillQty = parseFloat(
      String(result.data?.filled_qty ?? result.data?.qty ?? ""),
    );
    const fillPrice = parseFloat(String(result.data?.filled_avg_price ?? ""));
    return {
      ok: true,
      status: result.status,
      rejectReason: null,
      orderId: String(result.data?.id ?? ""),
      fillQty: Number.isFinite(fillQty) && fillQty > 0 ? fillQty : undefined,
      fillPrice:
        Number.isFinite(fillPrice) && fillPrice > 0 ? fillPrice : undefined,
      fillTime: result.data?.created_at ?? undefined,
      orderStatus: result.data?.status ?? "accepted",
    };
  },

  async getBalances(creds: BrokerCredentials) {
    const conn = creds as AlpacaConn;
    const account = await alpaca(conn, "/v2/account");
    if (!account.ok) return null;
    return {
      cashUsd: num(account.data?.cash),
      equityUsd: num(account.data?.equity),
    };
  },

  async getHoldings(creds: BrokerCredentials): Promise<NormalizedHolding[]> {
    const conn = creds as AlpacaConn;
    const positions = await alpaca(conn, "/v2/positions");
    if (!positions.ok || !Array.isArray(positions.data)) return [];
    const holdings: NormalizedHolding[] = [];
    for (const p of positions.data) {
      const qty = num(p.qty);
      const avgEntry = num(p.avg_entry_price);
      const currentPrice = num(p.current_price);
      const currentValue = num(p.market_value) || qty * currentPrice;
      const invested = qty * avgEntry;
      const pnl = num(p.unrealized_pl) || currentValue - invested;
      const asset = assetForAlpacaSymbol(p.symbol);
      holdings.push({
        symbol: asset?.symbol ?? p.symbol,
        name: asset?.name ?? p.symbol,
        quantity: qty,
        avgBuyPrice: avgEntry,
        currentPrice,
        currentValue,
        pnl,
        pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
        logoUrl: asset?.logoUrl ?? "",
        broker: "alpaca",
      });
    }
    return holdings;
  },

  async getRecentTrades(
    creds: BrokerCredentials,
    limit: number,
  ): Promise<NormalizedTrade[]> {
    const conn = creds as AlpacaConn;
    const result = await alpaca(
      conn,
      `/v2/orders?status=all&limit=${limit}&direction=desc`,
    );
    if (!result.ok || !Array.isArray(result.data)) return [];
    return result.data.map((o: any) => {
      const asset = assetForAlpacaSymbol(o.symbol);
      const qty = num(o.filled_qty) || num(o.qty);
      const price = num(o.filled_avg_price);
      return {
        id: `alpaca-${o.id}`,
        symbol: asset?.symbol ?? o.symbol,
        name: asset?.name ?? o.symbol,
        side: o.side === "sell" ? ("sell" as const) : ("buy" as const),
        quantity: qty,
        price,
        total: num(o.notional) || qty * price,
        createdAt: o.created_at ?? o.submitted_at ?? new Date().toISOString(),
        logoUrl: asset?.logoUrl ?? "",
        broker: "alpaca",
        status: o.status ?? "unknown",
      };
    });
  },

  async getMarketQuotes(
    creds: BrokerCredentials,
    assets: CoinData[],
  ): Promise<MarketQuote[]> {
    const conn = creds as AlpacaConn;
    const supported = assets
      .filter(
        (asset) => asset.assetType === "stock" || asset.assetType === "crypto",
      )
      .map((asset) => ({
        asset,
        symbol: toAlpacaSymbol(asset.symbol, asset.assetType),
      }))
      .filter((item): item is { asset: CoinData; symbol: string } =>
        Boolean(item.symbol),
      );
    if (!supported.length) return [];
    const stocks = supported.filter(({ asset }) => asset.assetType === "stock");
    const crypto = supported.filter(
      ({ asset }) => asset.assetType === "crypto",
    );
    const fetchSet = async (
      items: { asset: CoinData; symbol: string }[],
      market: "stocks" | "crypto",
    ) => {
      if (!items.length) return [] as MarketQuote[];
      const symbols = items.map((item) => item.symbol).join(",");
      const base =
        market === "stocks"
          ? "https://data.alpaca.markets/v2/stocks"
          : "https://data.alpaca.markets/v1beta3/crypto/us";
      const feed = market === "stocks" ? "&feed=iex" : "";
      const headers = {
        "APCA-API-KEY-ID": conn.apiKey,
        "APCA-API-SECRET-KEY": conn.apiSecret,
      };
      try {
        const [quoteResponse, barResponse] = await Promise.all([
          fetch(
            `${base}/quotes/latest?symbols=${encodeURIComponent(symbols)}${feed}`,
            { headers, signal: AbortSignal.timeout(10000) },
          ),
          fetch(
            `${base}/bars/latest?symbols=${encodeURIComponent(symbols)}${feed}`,
            { headers, signal: AbortSignal.timeout(10000) },
          ),
        ]);
        if (!quoteResponse.ok) return [] as MarketQuote[];
        const quoteData = (await quoteResponse.json()) as {
          quotes?: Record<string, any>;
        };
        const barData = barResponse.ok
          ? ((await barResponse.json()) as {
              bars?: Record<string, any>;
            })
          : undefined;
        return items.flatMap(({ asset, symbol }) => {
          const quote = quoteData.quotes?.[symbol];
          const bar = barData?.bars?.[symbol];
          const bid = num(quote?.bp);
          const ask = num(quote?.ap);
          const price = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask;
          const open = num(bar?.o);
          if (price <= 0) return [];
          return [
            {
              symbol: asset.symbol,
              price,
              change24h: open > 0 ? ((price - open) / open) * 100 : 0,
              ...(bar ? { volume: num(bar.v) } : {}),
              source: `alpaca-${market}`,
            },
          ];
        });
      } catch {
        return [] as MarketQuote[];
      }
    };
    return [
      ...(await fetchSet(stocks, "stocks")),
      ...(await fetchSet(crypto, "crypto")),
    ];
  },

  async getMarketBars(
    creds: BrokerCredentials,
    brokerSymbol: string,
    timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
    limit: number,
  ): Promise<MarketBar[] | null> {
    const conn = creds as AlpacaConn;
    const isCrypto = brokerSymbol.includes("/");
    const endpoint = isCrypto
      ? `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(brokerSymbol)}&timeframe=${timeframe === "1d" ? "1Day" : timeframe === "1h" ? "1Hour" : timeframe === "15m" ? "15Min" : timeframe === "5m" ? "5Min" : "1Min"}&limit=${limit}`
      : `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(brokerSymbol)}/bars?timeframe=${timeframe === "1d" ? "1Day" : timeframe === "1h" ? "1Hour" : timeframe === "15m" ? "15Min" : timeframe === "5m" ? "5Min" : "1Min"}&limit=${limit}&feed=iex`;
    try {
      const response = await fetch(endpoint, {
        headers: {
          "APCA-API-KEY-ID": conn.apiKey,
          "APCA-API-SECRET-KEY": conn.apiSecret,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        bars?: any[];
        barsBySymbol?: Record<string, any[]>;
      };
      const bars = isCrypto ? data.barsBySymbol?.[brokerSymbol] : data.bars;
      if (!Array.isArray(bars) || bars.length === 0) return null;
      return bars
        .map((bar) => ({
          time: String(bar.t),
          open: num(bar.o),
          high: num(bar.h),
          low: num(bar.l),
          close: num(bar.c),
          volume: num(bar.v),
        }))
        .filter(
          (bar) => bar.open > 0 && bar.high > 0 && bar.low > 0 && bar.close > 0,
        );
    } catch {
      return null;
    }
  },
};
