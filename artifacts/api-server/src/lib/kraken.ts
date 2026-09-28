import crypto from "node:crypto";

const API_BASE = "https://api.kraken.com/0";

export interface KrakenCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface KrakenResponse<T> {
  error: string[];
  result: T;
}

export function krakenSignature(
  path: string,
  data: Record<string, string>,
  apiSecret: string,
): string {
  const body = new URLSearchParams(data).toString();
  const digest = crypto
    .createHash("sha256")
    .update(`${data.nonce}${body}`)
    .digest();
  return crypto
    .createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(Buffer.concat([Buffer.from(path), digest]))
    .digest("base64");
}

let lastNonce = 0;

function nextNonce(): string {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return String(lastNonce);
}

export async function krakenPrivate<T>(
  credentials: KrakenCredentials,
  endpoint: string,
  params: Record<string, string> = {},
): Promise<KrakenResponse<T>> {
  const path = `/0/private/${endpoint}`;
  const data = { ...params, nonce: nextNonce() };
  const body = new URLSearchParams(data).toString();
  const response = await fetch(`${API_BASE}/private/${endpoint}`, {
    method: "POST",
    headers: {
      "API-Key": credentials.apiKey,
      "API-Sign": krakenSignature(path, data, credentials.apiSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as KrakenResponse<T>;
  if (!response.ok || payload.error?.length) {
    throw new Error(
      payload.error?.join(", ") || `Kraken API returned ${response.status}`,
    );
  }
  return payload;
}

export async function krakenPublic<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<KrakenResponse<T>> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(
    `${API_BASE}/public/${endpoint}${query ? `?${query}` : ""}`,
  );
  const payload = (await response.json()) as KrakenResponse<T>;
  if (!response.ok || payload.error?.length) {
    throw new Error(
      payload.error?.join(", ") || `Kraken API returned ${response.status}`,
    );
  }
  return payload;
}
