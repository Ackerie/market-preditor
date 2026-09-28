export interface OandaConn {
  apiToken: string;
  accountId: string;
  mode: string;
}

export function oandaBaseUrl(mode: string): string {
  return mode === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";
}

export async function oanda(
  conn: OandaConn,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(`${oandaBaseUrl(conn.mode)}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${conn.apiToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { errorMessage: "Could not reach OANDA. Please try again." } };
  }
}

/** Map an internal symbol to an OANDA v20 instrument. Returns null if not tradable on OANDA. */
export function toOandaInstrument(symbol: string, assetType: string): string | null {
  if (assetType === "forex") {
    // EURUSD -> EUR_USD, XAUUSD -> XAU_USD
    if (symbol.length === 6) return `${symbol.slice(0, 3)}_${symbol.slice(3)}`;
    return null;
  }
  if (assetType === "commodity") {
    const map: Record<string, string> = {
      WTI: "WTICO_USD",
      BRENT: "BCO_USD",
      NATGAS: "NATGAS_USD",
      SILVER: "XAG_USD",
      COPPER: "XCU_USD",
      PLATINUM: "XPT_USD",
      WHEAT: "WHEAT_USD",
      CORN: "CORN_USD",
    };
    return map[symbol] ?? null;
  }
  if (assetType === "futures") {
    // Index futures trade as OANDA index CFDs
    const map: Record<string, string> = {
      "ES-FUT": "SPX500_USD",
      "NQ-FUT": "NAS100_USD",
      "YM-FUT": "US30_USD",
      "RTY-FUT": "US2000_USD",
    };
    return map[symbol] ?? null;
  }
  return null;
}

export type OandaTradeability =
  | { tradeable: true }
  | { tradeable: false; reason: "market_closed" | "not_tradeable" }
  | { tradeable: true; unknown: true };

const tradeabilityCache = new Map<string, { result: OandaTradeability; expiresAt: number }>();
const TRADEABILITY_TTL_MS = 60_000;
// When OANDA rejects an order because the account cannot trade the instrument
// (region/division restriction), remember it for much longer — the restriction
// is account-level and won't change minute to minute.
const ACCOUNT_RESTRICTED_TTL_MS = 6 * 60 * 60 * 1000;

function tradeabilityKey(conn: OandaConn, instrument: string): string {
  return `${conn.mode}:${conn.accountId}:${instrument}`;
}

/** True when an order-reject reason means the account can never trade this instrument. */
export function isAccountRestrictedReject(reason: string | null): boolean {
  return typeof reason === "string" && /not tradeable by the account/i.test(reason);
}

/**
 * Remember (for several hours) that this account cannot trade this instrument,
 * so subsequent cycles skip it instead of re-submitting orders OANDA will reject.
 */
export function markOandaInstrumentUntradeable(conn: OandaConn, instrument: string): void {
  tradeabilityCache.set(tradeabilityKey(conn, instrument), {
    result: { tradeable: false, reason: "not_tradeable" },
    expiresAt: Date.now() + ACCOUNT_RESTRICTED_TTL_MS,
  });
}

/**
 * Check whether an instrument can be traded right now on this account.
 * Uses the pricing endpoint's `tradeable` flag (covers weekend closes and
 * halts) and treats a 4xx response as "not offered to this account"
 * (e.g. index CFDs unavailable in some regions). Transient network errors
 * return tradeable so the order path can handle them normally.
 */
export async function oandaTradeability(conn: OandaConn, instrument: string): Promise<OandaTradeability> {
  const key = tradeabilityKey(conn, instrument);
  const cached = tradeabilityCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const res = await oanda(conn, `/v3/accounts/${conn.accountId}/pricing?instruments=${encodeURIComponent(instrument)}`);
  let result: OandaTradeability;
  if (res.status === 0 || res.status >= 500) {
    // Could not reach OANDA or transient server error — don't cache,
    // let the caller proceed and handle errors normally.
    return { tradeable: true, unknown: true };
  } else if (!res.ok) {
    result = { tradeable: false, reason: "not_tradeable" };
  } else {
    const p = res.data?.prices?.[0];
    if (!p) {
      result = { tradeable: false, reason: "not_tradeable" };
    } else if (p.tradeable === false || p.status === "non-tradeable") {
      result = { tradeable: false, reason: "market_closed" };
    } else {
      result = { tradeable: true };
    }
  }
  tradeabilityCache.set(key, { result, expiresAt: Date.now() + TRADEABILITY_TTL_MS });
  return result;
}

// OANDA rejects orders whose units have more decimal places than the
// instrument allows (tradeUnitsPrecision, e.g. 0 for currency pairs, 1 for
// some CFDs). The spec is static per instrument, so cache it for a day.
const unitsPrecisionCache = new Map<string, { precision: number; expiresAt: number }>();
const UNITS_PRECISION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Look up how many decimal places OANDA allows in order units for this
 * instrument. Falls back to 0 (whole units — always accepted) when the
 * spec cannot be fetched.
 */
export async function oandaTradeUnitsPrecision(conn: OandaConn, instrument: string): Promise<number> {
  const key = `${conn.mode}:${conn.accountId}:${instrument}`;
  const cached = unitsPrecisionCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.precision;
  const res = await oanda(conn, `/v3/accounts/${conn.accountId}/instruments?instruments=${encodeURIComponent(instrument)}`);
  const raw = res.data?.instruments?.[0]?.tradeUnitsPrecision;
  const precision = res.ok && Number.isInteger(raw) && raw >= 0 && raw <= 8 ? (raw as number) : 0;
  if (res.ok) unitsPrecisionCache.set(key, { precision, expiresAt: Date.now() + UNITS_PRECISION_TTL_MS });
  return precision;
}

/** Round units to a precision; sells round down so a reduce can never overshoot the position. */
export function roundUnits(units: number, precision: number, side: "buy" | "sell"): number {
  const factor = Math.pow(10, precision);
  const scaled = units * factor;
  const rounded = side === "sell" ? Math.floor(scaled) : Math.round(scaled);
  return rounded / factor;
}

/** Fetch the current mid price for an instrument. Returns null on failure. */
export async function oandaPrice(conn: OandaConn, instrument: string): Promise<number | null> {
  const res = await oanda(conn, `/v3/accounts/${conn.accountId}/pricing?instruments=${encodeURIComponent(instrument)}`);
  if (!res.ok) return null;
  const p = res.data?.prices?.[0];
  if (!p) return null;
  const bid = parseFloat(p.closeoutBid ?? p.bids?.[0]?.price ?? "0");
  const ask = parseFloat(p.closeoutAsk ?? p.asks?.[0]?.price ?? "0");
  if (!bid || !ask) return null;
  return (bid + ask) / 2;
}

/**
 * Place a market order for a USD notional amount. OANDA orders are in units,
 * so we convert notional -> units at the current price.
 * Positive units = buy/long, negative = sell/short (here: reduce/close long).
 */
export async function oandaMarketOrderNotional(
  conn: OandaConn,
  instrument: string,
  side: "buy" | "sell",
  notionalUsd: number
): Promise<{ ok: boolean; status: number; data: any; units: number }> {
  const price = await oandaPrice(conn, instrument);
  if (!price || price <= 0) {
    return { ok: false, status: 0, data: { errorMessage: "Could not get a live price from OANDA for this instrument." }, units: 0 };
  }
  // Units are denominated in the base currency/asset. OANDA rejects units
  // with more decimals than the instrument's tradeUnitsPrecision allows
  // (0 for currency pairs), so round to the instrument's actual precision.
  const precision = await oandaTradeUnitsPrecision(conn, instrument);
  const units = roundUnits(notionalUsd / price, precision, side);
  if (units <= 0) {
    return { ok: false, status: 0, data: { errorMessage: "Order amount is too small for this instrument." }, units: 0 };
  }
  const signed = side === "buy" ? units : -units;
  const res = await oanda(conn, `/v3/accounts/${conn.accountId}/orders`, {
    method: "POST",
    body: {
      order: {
        type: "MARKET",
        instrument,
        units: String(signed),
        timeInForce: "FOK",
        // Sells only ever reduce an existing long — never open a short.
        positionFill: side === "sell" ? "REDUCE_ONLY" : "DEFAULT",
      },
    },
  });
  const rejected = res.data?.orderRejectTransaction || res.data?.orderCancelTransaction;
  return { ok: res.ok && !rejected, status: res.status, data: res.data, units: signed };
}

/**
 * Extract a human-readable rejection reason from an OANDA order response.
 * OANDA can return HTTP 201 with an orderCancelTransaction (e.g. FOK orders
 * cancelled because the market is closed), so check both transaction types.
 */
export function oandaRejectReason(data: any): string | null {
  const raw =
    data?.errorMessage ??
    data?.orderRejectTransaction?.rejectReason ??
    data?.orderRejectTransaction?.reason ??
    data?.orderCancelTransaction?.reason;
  if (typeof raw !== "string" || !raw) return null;
  if (isAccountRestrictedReject(raw)) {
    // Keep the "not tradeable by the Account" phrase so callers can still detect it.
    return "this instrument is not tradeable by the Account (your OANDA account/region does not offer it)";
  }
  const friendly: Record<string, string> = {
    MARKET_HALTED: "the market for this instrument is closed right now (forex and CFD markets close on weekends)",
    INSUFFICIENT_MARGIN: "the account does not have enough available margin for this order",
    INSUFFICIENT_LIQUIDITY: "there was not enough market liquidity to fill the order immediately",
  };
  return friendly[raw] ?? raw;
}
