/**
 * Low-level Deriv WebSocket API client.
 *
 * Deriv speaks JSON over a single WebSocket keyed by app_id; each request
 * carries a numeric `req_id` that the matching response echoes back. This
 * module opens one connection per call batch (connect → authorize → send →
 * close), which keeps ordering and error handling simple and avoids leaking
 * sockets in a long-running server.
 *
 * Node's built-in WebSocket client (stable since Node 22) is used, so no
 * extra dependency is required.
 *
 * Set DERIV_APP_ID in the environment for production; the default 1089 is
 * Deriv's public test app id. Register your own at https://api.deriv.com/.
 */

const WS_URL = "wss://ws.derivws.com/websockets/v3";
const DEFAULT_APP_ID = "1089";
const REQUEST_TIMEOUT_MS = 15_000;

export interface DerivConn {
  apiToken: string;
  mode: string;
  loginId?: string;
}

export class DerivError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DerivError";
    this.code = code;
  }
}

function derivAppId(): string {
  return process.env.DERIV_APP_ID?.trim() || DEFAULT_APP_ID;
}

function num(value: unknown): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

type DerivMessage = Record<string, any>;

function openSocket(): WebSocket {
  return new WebSocket(`${WS_URL}?app_id=${derivAppId()}`);
}

function parseMessage(data: unknown): DerivMessage | null {
  try {
    return JSON.parse(typeof data === "string" ? data : "");
  } catch {
    return null;
  }
}

function withDerivSocket<T>(
  onOpen: (ws: WebSocket) => void,
  onMessage: (
    msg: DerivMessage,
    ws: WebSocket,
    finish: (error?: Error, value?: T) => void,
  ) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = openSocket();
    let done = false;

    const finish = (error?: Error, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      if (error) reject(error);
      else resolve(value as T);
    };

    const timer = setTimeout(
      () => finish(new DerivError("Timeout", "Deriv did not respond in time")),
      REQUEST_TIMEOUT_MS,
    );

    ws.onerror = () =>
      finish(new DerivError("ConnectionFailed", "Could not reach Deriv"));
    ws.onclose = () => {
      if (!done) {
        finish(new DerivError("ConnectionClosed", "Deriv closed the socket"));
      }
    };
    ws.onopen = () => {
      try {
        onOpen(ws);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };
    ws.onmessage = (event) => {
      const msg = parseMessage(event.data);
      if (!msg) return;
      try {
        onMessage(msg, ws, finish);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };
  });
}

/**
 * Validate an API token and return the account identity. Used by the connect
 * route before anything is stored.
 */
export async function derivAuthorize(apiToken: string): Promise<{
  loginId: string;
  isVirtual: boolean;
  balance: number;
  currency: string;
}> {
  return withDerivSocket(
    (ws) => ws.send(JSON.stringify({ authorize: apiToken, req_id: 1 })),
    (msg, _ws, finish) => {
      if (msg.req_id !== 1) return;
      if (msg.error) {
        finish(
          new DerivError(
            String(msg.error.code ?? "AuthorizeFailed"),
            String(msg.error.message ?? "Deriv rejected the API token"),
          ),
        );
        return;
      }
      const auth = msg.authorize ?? {};
      finish(undefined, {
        loginId: String(auth.loginid ?? ""),
        isVirtual: Boolean(auth.is_virtual),
        balance: num(auth.balance),
        currency: String(auth.currency ?? "USD"),
      });
    },
  );
}

/**
 * Open one authorized session, send all requests over it, resolve with the
 * responses in request order, then close. The first errored request rejects
 * the whole batch.
 */
export async function derivSession<T = DerivMessage>(
  conn: DerivConn,
  requests: Record<string, unknown>[],
): Promise<T[]> {
  if (requests.length === 0) return [];
  const results: (T | undefined)[] = new Array(requests.length);
  return withDerivSocket<T[]>(
    (ws) => ws.send(JSON.stringify({ authorize: conn.apiToken, req_id: 0 })),
    (msg, ws, finish) => {
      if (typeof msg.req_id !== "number") return;

      if (msg.req_id === 0) {
        if (msg.error) {
          finish(
            new DerivError(
              String(msg.error.code ?? "AuthorizeFailed"),
              String(msg.error.message ?? "Deriv rejected the API token"),
            ),
          );
          return;
        }
        requests.forEach((payload, index) => {
          ws.send(JSON.stringify({ ...payload, req_id: index + 1 }));
        });
        return;
      }

      const index = msg.req_id - 1;
      if (index < 0 || index >= requests.length) return;
      if (msg.error) {
        finish(
          new DerivError(
            String(msg.error.code ?? "DerivError"),
            String(msg.error.message ?? "Deriv request failed"),
          ),
        );
        return;
      }
      results[index] = msg as T;
      if (results.every((result) => result !== undefined)) {
        finish(undefined, results as T[]);
      }
    },
  );
}

export async function derivCall<T = DerivMessage>(
  conn: DerivConn,
  payload: Record<string, unknown>,
): Promise<T> {
  const [result] = await derivSession<T>(conn, [payload]);
  return result;
}

export async function derivBalance(
  conn: DerivConn,
): Promise<{ balance: number; currency: string }> {
  const res = await derivCall(conn, { balance: 1 });
  return {
    balance: num(res.balance?.balance),
    currency: String(res.balance?.currency ?? "USD"),
  };
}

export interface DerivPortfolioContract {
  contractId: number;
  contractType: string;
  underlying: string;
  buyPrice: number;
  bidPrice: number;
  shortcode: string;
  purchaseTime: number;
  currency: string;
}

export async function derivPortfolio(
  conn: DerivConn,
): Promise<DerivPortfolioContract[]> {
  const res = await derivCall(conn, { portfolio: 1 });
  const contracts = (res.portfolio?.contracts ?? []) as Record<string, any>[];
  return contracts.map((c) => ({
    contractId: num(c.contract_id),
    contractType: String(c.contract_type ?? ""),
    underlying: String(c.underlying ?? ""),
    buyPrice: num(c.buy_price),
    bidPrice: num(c.bid_price),
    shortcode: String(c.shortcode ?? ""),
    purchaseTime: num(c.purchase_time ?? c.date_start),
    currency: String(c.currency ?? "USD"),
  }));
}

export async function derivBuyMultiplier(
  conn: DerivConn,
  opts: {
    symbol: string;
    stakeUsd: number;
    multiplier: number;
  },
): Promise<{ contractId: number; buyPrice: number }> {
  const res = await derivCall(conn, {
    buy: 1,
    price: opts.stakeUsd,
    parameters: {
      amount: opts.stakeUsd,
      basis: "stake",
      contract_type: "MULTUP",
      currency: "USD",
      multiplier: opts.multiplier,
      symbol: opts.symbol,
    },
  });
  return {
    contractId: num(res.buy?.contract_id),
    buyPrice: num(res.buy?.buy_price),
  };
}

/** Sell an open contract. Returns the total amount credited. */
export async function derivSellContract(
  conn: DerivConn,
  contractId: number,
  minPrice = 0,
): Promise<number> {
  const res = await derivCall(conn, { sell: contractId, price: minPrice });
  return num(res.sell?.sold_for);
}

/** Price a hypothetical stake — doubles as a market-open/tradeability probe. */
export async function derivProposal(
  conn: DerivConn,
  opts: { symbol: string; stakeUsd: number; multiplier: number },
): Promise<number> {
  const res = await derivCall(conn, {
    proposal: 1,
    amount: opts.stakeUsd,
    basis: "stake",
    contract_type: "MULTUP",
    currency: "USD",
    multiplier: opts.multiplier,
    symbol: opts.symbol,
  });
  return num(res.proposal?.ask_price);
}

export interface DerivCandle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function derivCandles(
  conn: DerivConn,
  symbol: string,
  granularitySeconds: number,
  count: number,
): Promise<DerivCandle[]> {
  const res = await derivCall(conn, {
    ticks_history: symbol,
    adjust_start_time: 1,
    count,
    end: "latest",
    granularity: granularitySeconds,
    style: "candles",
  });
  const candles = (res.candles ?? []) as Record<string, any>[];
  return candles.map((c) => ({
    epoch: num(c.epoch),
    open: num(c.open),
    high: num(c.high),
    low: num(c.low),
    close: num(c.close),
  }));
}

export interface DerivProfitTableEntry {
  contractId: number;
  underlying: string;
  shortcode: string;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  purchaseTime: number;
  sellTime: number;
}

export async function derivProfitTable(
  conn: DerivConn,
  limit: number,
): Promise<DerivProfitTableEntry[]> {
  const res = await derivCall(conn, {
    profit_table: 1,
    limit,
    offset: 0,
    sort: "DESC",
  });
  const txs = (res.profit_table?.transactions ?? []) as Record<string, any>[];
  return txs.map((t) => ({
    contractId: num(t.contract_id),
    underlying: String(t.underlying_symbol ?? t.underlying ?? ""),
    shortcode: String(t.shortcode ?? ""),
    buyPrice: num(t.buy_price),
    sellPrice: num(t.sell_price),
    profit: num(t.profit),
    purchaseTime: num(t.purchase_time),
    sellTime: num(t.sell_time),
  }));
}
