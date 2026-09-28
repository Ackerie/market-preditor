import crypto from "node:crypto";

const FUTURES_BASES = {
  live: "https://futures.kraken.com/derivatives/api/v3",
  demo: "https://demo-futures.kraken.com/derivatives/api/v3",
} as const;

export type KrakenFuturesMode = keyof typeof FUTURES_BASES;

export interface KrakenFuturesCredentials {
  apiKey: string;
  apiSecret: string;
  mode: KrakenFuturesMode;
}

export interface KrakenFuturesResponse<T> {
  result: "success" | "error";
  serverTime?: string;
  error?: string;
  [key: string]: unknown;
  data?: T;
}

let lastNonce = 0;

function nextNonce(): string {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return String(lastNonce);
}

export function krakenFuturesAuthent(
  endpointPath: string,
  postData: string,
  nonce: string,
  apiSecret: string,
): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${postData}${nonce}${endpointPath}`)
    .digest();
  return crypto
    .createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(digest)
    .digest("base64");
}

export async function krakenFuturesPublic<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(
    `${FUTURES_BASES.live}/${endpoint}${query ? `?${query}` : ""}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    throw new Error(`Kraken Futures returned ${response.status}`);
  const payload = (await response.json()) as T & {
    result?: string;
    error?: string;
  };
  if (payload.result === "error") {
    throw new Error(payload.error ?? "Kraken Futures request failed");
  }
  return payload;
}

export async function krakenFuturesPrivate<T>(
  credentials: KrakenFuturesCredentials,
  endpoint: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const nonce = nextNonce();
  const postData = new URLSearchParams(params).toString();
  const endpointPath = `/api/v3/${endpoint}`;
  const url = `${FUTURES_BASES[credentials.mode]}/${endpoint}${method === "GET" && postData ? `?${postData}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      APIKey: credentials.apiKey,
      Authent: krakenFuturesAuthent(
        endpointPath,
        postData,
        nonce,
        credentials.apiSecret,
      ),
      Nonce: nonce,
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(method === "POST" ? { body: postData } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Kraken Futures returned ${response.status}`);
  const payload = (await response.json()) as T & {
    result?: string;
    error?: string;
  };
  if (payload.result === "error") {
    throw new Error(payload.error ?? "Kraken Futures request failed");
  }
  return payload;
}
