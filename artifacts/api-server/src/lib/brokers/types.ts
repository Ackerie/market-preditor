import type { CoinData } from "../coins";

/**
 * Opaque, adapter-owned credential bundle. Each adapter defines its own
 * concrete shape (e.g. Alpaca: apiKey/apiSecret/mode; OANDA:
 * apiToken/accountId/mode) and casts internally. Credentials are always
 * decrypted before being handed to an adapter.
 */
export type BrokerCredentials = unknown;

/** How an internal app symbol maps onto a broker-native instrument. */
export interface SymbolRoute {
  /** The symbol/instrument string the broker expects. */
  brokerSymbol: string;
  /** Asset type used for order parameters (time-in-force etc.). */
  effectiveAssetType: string;
  /** Human note when the tradable instrument differs from the listed one. */
  note?: string;
}

export interface Tradeability {
  tradeable: boolean;
  /** Set when tradeable is false. */
  reason?: "market_closed" | "not_tradeable";
}

/** A user's connection to this broker (credentials already decrypted). */
export interface ResolvedConnection {
  creds: BrokerCredentials;
  mode: string;
}

/** One opted-in auto-trade account row, normalized across brokers. */
export interface AutoTradeAccount {
  rowId: number;
  userId: string;
  mode: string;
  maxPerTradeUsd: number;
  dailyLimitUsd: number;
  spentTodayUsd: number;
  spendDate: string | null;
  creds: BrokerCredentials;
}

export interface PlaceOrderResult {
  ok: boolean;
  status: number;
  /** Human-readable rejection reason when ok is false. */
  rejectReason: string | null;
  orderId?: string;
  fillQty?: number;
  fillPrice?: number;
  fillTime?: string;
  orderStatus?: string;
}

export interface SellablePosition {
  marketValueUsd: number;
  /**
   * Broker-native quantity string usable for a full-position exit by qty
   * (avoids notional price-drift rejections). Omit if the broker only
   * supports notional sells.
   */
  qtyAvailable?: string;
}

export interface AccountBalances {
  cashUsd: number;
  equityUsd: number;
}

export interface MarketBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MarketQuote {
  symbol: string;
  price: number;
  change24h: number;
  volume?: number;
  source: string;
}

/** A holding normalized for the combined portfolio view. */
export interface NormalizedHolding {
  symbol: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  logoUrl: string;
  broker: string;
}

/** An order/fill normalized for the combined trade-history view. */
export interface NormalizedTrade {
  id: string;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  total: number;
  createdAt: string;
  logoUrl: string;
  broker: string;
  status: string;
}

/**
 * A pluggable broker. Implement this interface (one file per broker), then
 * register the adapter in `brokers/index.ts` — routing, the auto-trader,
 * manual trades, portfolio, and history all pick it up automatically.
 */
export interface BrokerAdapter {
  /** Stable ID stored in DB event rows — keep <= 10 chars, lowercase. */
  readonly id: string;
  readonly displayName: string;

  /**
   * Map an internal app symbol to this broker's instrument, or null when
   * this broker cannot trade it. Routing asks each registered adapter in
   * order; the first non-null answer wins.
   */
  routeSymbol(symbol: string, assetType: string): SymbolRoute | null;

  /** Reverse lookup: internal asset for a broker-native symbol, if known. */
  assetForBrokerSymbol(brokerSymbol: string): CoinData | undefined;

  /** The user's decrypted connection to this broker, if any. */
  getConnection(userId: string): Promise<ResolvedConnection | undefined>;

  /** All auto-trade-enabled accounts (optionally limited to one user). */
  listAutoTradeAccounts(onlyUserId?: string): Promise<AutoTradeAccount[]>;

  /**
   * Atomically reserve daily buy budget BEFORE placing an order. Must be a
   * single guarded UPDATE (no read-then-write) so concurrent cycles cannot
   * overrun the cap. Returns false when the reservation would exceed the
   * daily limit.
   */
  reserveDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<boolean>;

  /** Refund reserved/spent budget (rejected buys; executed sells). */
  refundDailyBudget(
    rowId: number,
    today: string,
    notionalUsd: number,
  ): Promise<void>;

  /**
   * Cheap pre-check before submitting an order (market hours, account
   * restrictions). Return { tradeable: true } if the broker has no such
   * concept.
   */
  checkTradeability(
    creds: BrokerCredentials,
    brokerSymbol: string,
  ): Promise<Tradeability>;

  /** USD available to fund a buy right now, or null when unreadable. */
  getAvailableCashUsd(
    creds: BrokerCredentials,
    effectiveAssetType: string,
  ): Promise<number | null>;

  /**
   * Broker-enforced minimum order size in USD for this asset type, if any
   * (e.g. Alpaca crypto orders must be >= $10). Orders below it are skipped
   * instead of being submitted and rejected.
   */
  minOrderNotionalUsd?(effectiveAssetType: string): number;

  /** The user's open position in this instrument, or null when none. */
  getSellablePosition(
    creds: BrokerCredentials,
    brokerSymbol: string,
    effectiveAssetType: string,
  ): Promise<SellablePosition | null>;

  /**
   * Place a USD-notional market order. When `qty` is provided (full-position
   * exits), sell by quantity instead. Adapters should internally record
   * account-level restrictions surfaced by rejections so checkTradeability
   * can skip the instrument on later cycles.
   */
  placeMarketOrder(
    creds: BrokerCredentials,
    opts: {
      brokerSymbol: string;
      side: "buy" | "sell";
      notionalUsd: number;
      qty?: string;
      effectiveAssetType: string;
    },
  ): Promise<PlaceOrderResult>;

  /** Cash + equity for the combined portfolio header. Null when unreadable. */
  getBalances(creds: BrokerCredentials): Promise<AccountBalances | null>;

  /** Open positions normalized for the combined portfolio view. */
  getHoldings(creds: BrokerCredentials): Promise<NormalizedHolding[]>;

  /** Recent orders/fills normalized for the combined history view. */
  getRecentTrades(
    creds: BrokerCredentials,
    limit: number,
  ): Promise<NormalizedTrade[]>;

  /** Fetch current quotes for the assets this broker can serve. */
  getMarketQuotes(
    creds: BrokerCredentials,
    assets: CoinData[],
  ): Promise<MarketQuote[]>;

  /** Fetch broker-native OHLC bars for AI analysis. Returns null on failure. */
  getMarketBars(
    creds: BrokerCredentials,
    brokerSymbol: string,
    timeframe: "1m" | "5m" | "15m" | "1h" | "1d",
    limit: number,
  ): Promise<MarketBar[] | null>;
}
