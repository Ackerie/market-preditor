import { and, eq, sql } from "drizzle-orm";
import { db, krakenConnectionsTable } from "@workspace/db";
import { ALL_ASSETS, type CoinData } from "../coins";
import { decryptCredential } from "../credentialCrypto";
import { krakenPrivate, krakenPublic, type KrakenCredentials } from "../kraken";
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

const KRAKEN_SYMBOLS: Record<string, string> = {
  BTC: "XBT",
  ETH: "ETH",
  SOL: "SOL",
  XRP: "XRP",
  ADA: "ADA",
  AVAX: "AVAX",
  DOT: "DOT",
  LINK: "LINK",
  DOGE: "DOGE",
};

function num(value: unknown): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function balanceFor(balances: Record<string, string>, symbol: string): number {
  const aliases =
    symbol === "BTC"
      ? ["XXBT", "XBT", "BTC"]
      : symbol === "ETH"
        ? ["XETH", "ETH"]
        : symbol === "XRP"
          ? ["XXRP", "XRP"]
          : symbol === "DOGE"
            ? ["XXDG", "XDG", "DOGE"]
            : [symbol, `X${symbol}`];
  const key = aliases.find((candidate) => balances[candidate] !== undefined);
  return key ? num(balances[key]) : 0;
}

function balanceForAsset(
  balances: Record<string, string>,
  asset: CoinData,
): number {
  if (asset.assetType === "stock") {
    return num(balances[`${asset.symbol}x`] ?? balances[`${asset.symbol}x.T`]);
  }
  return balanceFor(balances, asset.symbol);
}

function getAsset(symbol: string): CoinData | undefined {
  return ALL_ASSETS.find((asset) => asset.symbol === symbol);
}

function normalizeTickerKey(value: string): string {
  return value
    .replaceAll("/", "")
    .replace("XXBT", "XBT")
    .replace(/^BTC/, "XBT")
    .replace("ZUSD", "USD");
}

async function balancesFor(
  credentials: KrakenCredentials,
): Promise<Record<string, string>> {
  const response = await krakenPrivate<Record<string, string>>(
    credentials,
    "Balance",
  );
  return response.result ?? {};
}

async function getQuotes(assets: CoinData[]): Promise<MarketQuote[]> {
  const cryptoAssets = assets.filter(
    (asset) => asset.assetType === "crypto" && KRAKEN_SYMBOLS[asset.symbol],
  );
  const stockAssets = assets.filter((asset) => asset.assetType === "stock");
  const [cryptoResult, xstockResult] = await Promise.all([
    cryptoAssets.length
      ? krakenPublic<Record<string, any>>("Ticker", {
          pair: cryptoAssets
            .map((asset) => `${KRAKEN_SYMBOLS[asset.symbol]}USD`)
            .join(","),
          assetVersion: "1",
        })
      : Promise.resolve({ result: {} }),
    stockAssets.length
      ? krakenPublic<Record<string, any>>("Ticker", {
          asset_class: "tokenized_asset",
          assetVersion: "1",
        })
      : Promise.resolve({ result: {} }),
  ]);
  const cryptoTickers = (cryptoResult.result ?? {}) as Record<string, any>;
  const xstockTickers = (xstockResult.result ?? {}) as Record<string, any>;
  return [...cryptoAssets, ...stockAssets].flatMap((asset) => {
    const isXstock = asset.assetType === "stock";
    const pair = isXstock
      ? `${asset.symbol}x/USD`
      : `${KRAKEN_SYMBOLS[asset.symbol]}/USD`;
    const altname = isXstock
      ? `${asset.symbol}xUSD`
      : `${KRAKEN_SYMBOLS[asset.symbol]}USD`;
    const tickers = isXstock ? xstockTickers : cryptoTickers;
    const targetKeys = new Set(
      [pair, altname].map((value) => normalizeTickerKey(value)),
    );
    const ticker = Object.entries(tickers).find(
      ([key, candidate]: [string, any]) =>
        targetKeys.has(normalizeTickerKey(key)) ||
        targetKeys.has(normalizeTickerKey(String(candidate?.altname ?? ""))),
    )?.[1] as any;
    const price = num(ticker?.c?.[0]);
    if (price <= 0) return [];
    const open = num(ticker?.o);
    return [
      {
        symbol: asset.symbol,
        price,
        change24h: open > 0 ? ((price - open) / open) * 100 : 0,
        volume: num(ticker?.v?.[1]),
        source: "kraken",
      },
    ];
  });
}

export const krakenAdapter: BrokerAdapter = {
  id: "kraken",
  displayName: "Kraken",

  routeSymbol(symbol: string, assetType: string): SymbolRoute | null {
    if (assetType === "stock") {
      return {
        brokerSymbol: `${symbol}xUSD`,
        effectiveAssetType: "tokenized_asset",
      };
    }
    const krakenBase = KRAKEN_SYMBOLS[symbol];
    if (assetType !== "crypto" || !krakenBase) return null;
    return { brokerSymbol: `${krakenBase}USD`, effectiveAssetType: "crypto" };
  },

  assetForBrokerSymbol(brokerSymbol: string): CoinData | undefined {
    const normalized = brokerSymbol
      .replace("XBT", "BTC")
      .replace(/\/?USD$/, "")
      .replace(/x$/, "");
    return getAsset(normalized);
  },

  async getConnection(userId: string): Promise<ResolvedConnection | undefined> {
    const [row] = await db
      .select()
      .from(krakenConnectionsTable)
      .where(eq(krakenConnectionsTable.userId, userId));
    if (!row) return undefined;
    return {
      creds: {
        apiKey: decryptCredential(row.apiKey),
        apiSecret: decryptCredential(row.apiSecret),
      } satisfies KrakenCredentials,
      mode: "live",
    };
  },

  async listAutoTradeAccounts(
    onlyUserId?: string,
  ): Promise<AutoTradeAccount[]> {
    const rows = await db
      .select()
      .from(krakenConnectionsTable)
      .where(
        onlyUserId
          ? and(
              eq(krakenConnectionsTable.autoTradeEnabled, true),
              eq(krakenConnectionsTable.userId, onlyUserId),
            )
          : eq(krakenConnectionsTable.autoTradeEnabled, true),
      );
    return rows.map((row) => ({
      rowId: row.id,
      userId: row.userId,
      mode: "live",
      maxPerTradeUsd: num(row.autoTradeMaxUsd),
      dailyLimitUsd: num(row.autoTradeDailyLimitUsd),
      spentTodayUsd: num(row.spentTodayUsd),
      spendDate: row.spendDate,
      creds: {
        apiKey: decryptCredential(row.apiKey),
        apiSecret: decryptCredential(row.apiSecret),
      } satisfies KrakenCredentials,
    }));
  },

  async reserveDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<boolean> {
    const effectiveSpent = sql`CASE WHEN ${krakenConnectionsTable.spendDate} = ${today} THEN ${krakenConnectionsTable.spentTodayUsd} ELSE 0 END`;
    const reserved = await db
      .update(krakenConnectionsTable)
      .set({
        spentTodayUsd: sql`${effectiveSpent} + ${notionalUsd.toFixed(2)}`,
        spendDate: today,
      })
      .where(
        and(
          eq(krakenConnectionsTable.id, rowId),
          eq(krakenConnectionsTable.autoTradeEnabled, true),
          sql`${effectiveSpent} + ${notionalUsd.toFixed(2)} <= ${krakenConnectionsTable.autoTradeDailyLimitUsd}`,
        ),
      )
      .returning({ id: krakenConnectionsTable.id });
    return reserved.length > 0;
  },

  async refundDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<void> {
    const effectiveSpent = sql`CASE WHEN ${krakenConnectionsTable.spendDate} = ${today} THEN ${krakenConnectionsTable.spentTodayUsd} ELSE 0 END`;
    await db
      .update(krakenConnectionsTable)
      .set({
        spentTodayUsd: sql`GREATEST(${effectiveSpent} - ${notionalUsd.toFixed(2)}, 0)`,
        spendDate: today,
      })
      .where(eq(krakenConnectionsTable.id, rowId));
  },

  async checkTradeability(
    _creds: BrokerCredentials,
    brokerSymbol: string,
  ): Promise<Tradeability> {
    try {
      const ticker = await krakenPublic<Record<string, any>>("Ticker", {
        pair: brokerSymbol,
        ...(brokerSymbol.endsWith("xUSD")
          ? { asset_class: "tokenized_asset" }
          : {}),
      });
      return Object.keys(ticker.result ?? {}).length
        ? { tradeable: true }
        : { tradeable: false, reason: "not_tradeable" };
    } catch {
      return { tradeable: false, reason: "not_tradeable" };
    }
  },

  async getAvailableCashUsd(creds: BrokerCredentials): Promise<number | null> {
    try {
      const balances = await balancesFor(creds as KrakenCredentials);
      return num(balances.ZUSD ?? balances.USD);
    } catch {
      return null;
    }
  },

  async getSellablePosition(
    creds: BrokerCredentials,
    brokerSymbol: string,
  ): Promise<SellablePosition | null> {
    const asset = this.assetForBrokerSymbol(brokerSymbol);
    if (!asset) return null;
    try {
      const balances = await balancesFor(creds as KrakenCredentials);
      const quantity = balanceForAsset(balances, asset);
      if (quantity <= 0) return null;
      const [quote] = await getQuotes([asset]);
      if (!quote) return null;
      return {
        marketValueUsd: quantity * quote.price,
        qtyAvailable: String(quantity),
      };
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
    try {
      let volume = opts.qty;
      if (!volume) {
        const asset = this.assetForBrokerSymbol(opts.brokerSymbol);
        const quote = asset ? (await getQuotes([asset]))[0] : undefined;
        if (!quote || quote.price <= 0) {
          return {
            ok: false,
            status: 400,
            rejectReason: "Could not get a current Kraken price for this asset",
          };
        }
        volume = (opts.notionalUsd / quote.price).toPrecision(8);
      }
      const result = await krakenPrivate<{ txid?: string[] }>(
        creds as KrakenCredentials,
        "AddOrder",
        {
          pair: opts.brokerSymbol,
          type: opts.side,
          ordertype: "market",
          volume,
          ...(opts.effectiveAssetType === "tokenized_asset"
            ? { asset_class: "tokenized_asset" }
            : {}),
        },
      );
      return {
        ok: true,
        status: 200,
        rejectReason: null,
        orderId: result.result?.txid?.[0] ?? "",
        fillQty: num(volume),
        orderStatus: "accepted",
      };
    } catch (error) {
      return {
        ok: false,
        status: 400,
        rejectReason:
          error instanceof Error ? error.message : "Kraken rejected the order",
      };
    }
  },

  async getBalances(creds: BrokerCredentials) {
    try {
      const [balances, quotes] = await Promise.all([
        balancesFor(creds as KrakenCredentials),
        getQuotes(
          ALL_ASSETS.filter(
            (asset) =>
              asset.assetType === "stock" ||
              (asset.assetType === "crypto" &&
                Boolean(KRAKEN_SYMBOLS[asset.symbol])),
          ),
        ),
      ]);
      const usd = num(balances.ZUSD ?? balances.USD);
      const equityUsd = quotes.reduce((total, quote) => {
        const asset = getAsset(quote.symbol);
        return asset
          ? total + balanceForAsset(balances, asset) * quote.price
          : total;
      }, usd);
      return { cashUsd: usd, equityUsd };
    } catch {
      return null;
    }
  },

  async getHoldings(creds: BrokerCredentials): Promise<NormalizedHolding[]> {
    try {
      const [balances, quotes] = await Promise.all([
        balancesFor(creds as KrakenCredentials),
        getQuotes(
          ALL_ASSETS.filter(
            (asset) =>
              asset.assetType === "stock" ||
              (asset.assetType === "crypto" &&
                Boolean(KRAKEN_SYMBOLS[asset.symbol])),
          ),
        ),
      ]);
      return quotes.flatMap((quote) => {
        const asset = getAsset(quote.symbol);
        const quantity = asset ? balanceForAsset(balances, asset) : 0;
        if (quantity <= 0 || !quote || !asset) return [];
        return [
          {
            symbol: asset.symbol,
            name: asset.name,
            quantity,
            avgBuyPrice: 0,
            currentPrice: quote.price,
            currentValue: quantity * quote.price,
            pnl: 0,
            pnlPercent: 0,
            logoUrl: asset.logoUrl,
            broker: "kraken",
          },
        ];
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
      const response = await krakenPrivate<{ closed?: Record<string, any> }>(
        creds as KrakenCredentials,
        "ClosedOrders",
        { trades: "true", ofs: "0" },
      );
      return Object.entries(response.result?.closed ?? {})
        .slice(-limit)
        .map(([id, order]) => {
          const asset = this.assetForBrokerSymbol(
            String(order.descr?.pair ?? ""),
          );
          const quantity = num(order.vol_exec);
          const price = num(order.price);
          return {
            id: `kraken-${id}`,
            symbol: asset?.symbol ?? String(order.descr?.pair ?? ""),
            name: asset?.name ?? String(order.descr?.pair ?? ""),
            side:
              order.descr?.type === "sell"
                ? ("sell" as const)
                : ("buy" as const),
            quantity,
            price,
            total: num(order.cost) || quantity * price,
            createdAt: new Date(num(order.closetm) * 1000).toISOString(),
            logoUrl: asset?.logoUrl ?? "",
            broker: "kraken",
            status: String(order.status ?? "closed"),
          };
        });
    } catch {
      return [];
    }
  },

  async getMarketQuotes(
    _creds: BrokerCredentials,
    assets: CoinData[],
  ): Promise<MarketQuote[]> {
    try {
      return await getQuotes(assets);
    } catch {
      return [];
    }
  },

  async getMarketBars(
    _creds: BrokerCredentials,
    brokerSymbol: string,
    timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
    limit: number,
  ): Promise<MarketBar[] | null> {
    const interval =
      timeframe === "1d"
        ? 1440
        : timeframe === "1h"
          ? 60
          : timeframe === "15m"
            ? 15
            : timeframe === "5m"
              ? 5
              : 1;
    try {
      const response = await krakenPublic<Record<string, any>>("OHLC", {
        pair: brokerSymbol,
        interval: String(interval),
        ...(brokerSymbol.endsWith("xUSD")
          ? { asset_class: "tokenized_asset" }
          : {}),
      });
      const key = Object.keys(response.result ?? {}).find(
        (entry) => entry !== "last",
      );
      const rows = key ? (response.result[key] as unknown[]) : [];
      return rows
        .slice(-limit - 1, -1)
        .map((row: any) => ({
          time: new Date(num(row[0]) * 1000).toISOString(),
          open: num(row[1]),
          high: num(row[2]),
          low: num(row[3]),
          close: num(row[4]),
          volume: num(row[6]),
        }))
        .filter((bar) => bar.open > 0 && bar.close > 0);
    } catch {
      return null;
    }
  },
};
