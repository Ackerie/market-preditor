import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import {
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";

const SESSION_TOKEN_KEY = "api-session";
const SECURE_STORAGE_PREFIX = "nexustrade_";

let nativeApiBaseUrl: string | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initializeNativeApi(apiBaseUrl?: string): Promise<void> {
  if (!isNativeApp()) return;
  if (!apiBaseUrl) {
    throw new Error(
      "VITE_API_BASE_URL must be set when building the native app.",
    );
  }

  const parsedBaseUrl = new URL(apiBaseUrl);
  if (parsedBaseUrl.protocol !== "https:") {
    throw new Error("The native app API base URL must use HTTPS.");
  }

  nativeApiBaseUrl = parsedBaseUrl.origin.replace(/\/+$/, "");
  await SecureStorage.setKeyPrefix(SECURE_STORAGE_PREFIX);
  setBaseUrl(nativeApiBaseUrl);
  setAuthTokenGetter(() => SecureStorage.getItem(SESSION_TOKEN_KEY));
}

export async function saveNativeSession(token: string): Promise<void> {
  if (isNativeApp()) {
    await SecureStorage.setItem(SESSION_TOKEN_KEY, token);
  }
}

export async function clearNativeSession(): Promise<void> {
  if (isNativeApp()) {
    await SecureStorage.remove(SESSION_TOKEN_KEY);
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (!isNativeApp()) return fetch(input, init);
  if (!nativeApiBaseUrl) {
    throw new Error("Native API access has not been initialized.");
  }

  const request = input instanceof Request ? input : null;
  const requestUrl = request ? request.url : input.toString();
  const headers = new Headers(request?.headers);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  const token = await SecureStorage.getItem(SESSION_TOKEN_KEY);
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const requestInit: RequestInit = {
    ...(request
      ? {
          method: request.method,
          body: request.body,
          cache: request.cache,
          redirect: request.redirect,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          integrity: request.integrity,
          keepalive: request.keepalive,
          signal: request.signal,
        }
      : {}),
    ...init,
    headers,
    credentials: "omit",
  };

  return fetch(new URL(requestUrl, nativeApiBaseUrl), requestInit);
}
