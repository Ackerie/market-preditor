export interface AlpacaConn {
  apiKey: string;
  apiSecret: string;
  mode: string;
}

export function alpacaBaseUrl(mode: string): string {
  return mode === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

export async function alpaca(
  conn: AlpacaConn,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(`${alpacaBaseUrl(conn.mode)}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "APCA-API-KEY-ID": conn.apiKey,
        "APCA-API-SECRET-KEY": conn.apiSecret,
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
    return { ok: false, status: 0, data: { message: "Could not reach Alpaca. Please try again." } };
  }
}

/** Map an internal symbol to what Alpaca expects. Returns null if not tradable on Alpaca. */
// Cryptos listed in the app that Alpaca does not offer for trading —
// sending them produces `asset "X/USD" not found` rejections.
const ALPACA_UNSUPPORTED_CRYPTO = new Set(["BNB"]);

export function toAlpacaSymbol(symbol: string, assetType: string): string | null {
  if (assetType === "stock") return symbol;
  if (assetType === "crypto") {
    if (ALPACA_UNSUPPORTED_CRYPTO.has(symbol)) return null;
    return `${symbol}/USD`;
  }
  return null;
}
