import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    selectRows: [] as any[],
    krakenRows: [] as any[],
    washTradeRows: [] as any[],
    reserveResults: [] as any[][],
    updateCalls: [] as Array<{ set: any }>,
    deleteCalls: [] as Array<{ table: any; where: any }>,
    deleteFailFor: null as string | null,
    insertedEvents: [] as any[],
    alpaca: vi.fn(),
    oanda: vi.fn(),
    oandaMarketOrderNotional: vi.fn(),
    krakenPrivate: vi.fn(),
    krakenPublic: vi.fn(),
  };
});

vi.mock("@workspace/db", () => {
  const db = {
    select: () => ({
      from: (table: any) => ({
        // Awaiting `.where()` directly returns connection rows (account
        // listing); chaining `.limit()` returns the wash-trade guard rows.
        where: () => {
          const result: any = Promise.resolve(
            table?.name === "kraken_connections"
              ? mocks.krakenRows
              : mocks.selectRows,
          );
          result.limit = async () => mocks.washTradeRows;
          return result;
        },
      }),
    }),
    update: () => ({
      set: (setArg: any) => ({
        where: (_where: any) => {
          mocks.updateCalls.push({ set: setArg });
          const result = mocks.reserveResults.shift() ?? [{ id: 1 }];
          const promise = Promise.resolve(result) as Promise<any[]> & {
            returning: () => Promise<any[]>;
          };
          promise.returning = () => Promise.resolve(result);
          return promise;
        },
      }),
    }),
    insert: () => ({
      values: async (v: any) => {
        mocks.insertedEvents.push(v);
      },
    }),
    delete: (table: any) => ({
      where: async (where: any) => {
        if (mocks.deleteFailFor === table.name)
          throw new Error(`simulated ${table.name} delete failure`);
        mocks.deleteCalls.push({ table, where });
      },
    }),
  };
  return {
    db,
    brokerConnectionsTable: {
      id: "id",
      autoTradeEnabled: "autoTradeEnabled",
      spendDate: "spendDate",
      spentTodayUsd: "spentTodayUsd",
      autoTradeDailyLimitUsd: "autoTradeDailyLimitUsd",
    },
    oandaConnectionsTable: {
      id: "id",
      autoTradeEnabled: "autoTradeEnabled",
      spendDate: "spendDate",
      spentTodayUsd: "spentTodayUsd",
      autoTradeDailyLimitUsd: "autoTradeDailyLimitUsd",
    },
    krakenConnectionsTable: {
      name: "kraken_connections",
      id: "id",
      autoTradeEnabled: "autoTradeEnabled",
      spendDate: "spendDate",
      spentTodayUsd: "spentTodayUsd",
      autoTradeDailyLimitUsd: "autoTradeDailyLimitUsd",
    },
    autoTradeEventsTable: { name: "auto_trade_events", createdAt: "createdAt" },
    autoTradeNotificationsTable: {
      name: "auto_trade_notifications",
      sentAt: "sentAt",
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: any[]) => ({ and: args }),
  eq: (...args: any[]) => ({ eq: args }),
  lt: (...args: any[]) => ({ lt: args }),
  gt: (...args: any[]) => ({ gt: args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: any[]) => ({
      sql: strings.join("?"),
      vals,
    }),
    {
      raw: (s: string) => ({ sql: s }),
    },
  ),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./credentialCrypto", () => ({
  decryptCredential: (v: string) => `dec(${v})`,
}));

vi.mock("./alpaca", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./alpaca")>()),
  alpaca: mocks.alpaca,
}));

vi.mock("./oanda", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oanda")>()),
  oanda: mocks.oanda,
  oandaMarketOrderNotional: mocks.oandaMarketOrderNotional,
  oandaTradeability: vi.fn().mockResolvedValue({ tradeable: true }),
}));

vi.mock("./kraken", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./kraken")>()),
  krakenPrivate: mocks.krakenPrivate,
  krakenPublic: mocks.krakenPublic,
}));

import { executeRealTrades, pruneOldAutoTradeEvents } from "./realAutoTrade";

const today = new Date().toISOString().slice(0, 10);

function alpacaConnRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1,
    userId: "user-1",
    apiKey: "enc-key",
    apiSecret: "enc-secret",
    mode: "paper",
    autoTradeEnabled: true,
    autoTradeMaxUsd: "50",
    autoTradeDailyLimitUsd: "100",
    spentTodayUsd: "0",
    spendDate: today,
    ...overrides,
  };
}

function oandaConnRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 2,
    userId: "user-2",
    apiToken: "enc-token",
    accountId: "acct-123",
    mode: "practice",
    autoTradeEnabled: true,
    autoTradeMaxUsd: "50",
    autoTradeDailyLimitUsd: "100",
    spentTodayUsd: "0",
    spendDate: today,
    ...overrides,
  };
}

function krakenConnRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 3,
    userId: "user-3",
    apiKey: "enc-kraken-key",
    apiSecret: "enc-kraken-secret",
    autoTradeEnabled: true,
    autoTradeMaxUsd: "40",
    autoTradeDailyLimitUsd: "80",
    spentTodayUsd: "0",
    spendDate: today,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.selectRows = [];
  mocks.washTradeRows = [];
  mocks.reserveResults = [];
  mocks.updateCalls = [];
  mocks.deleteCalls = [];
  mocks.insertedEvents = [];
  mocks.alpaca.mockReset();
  mocks.oanda.mockReset();
  mocks.oandaMarketOrderNotional.mockReset();
  mocks.krakenPrivate.mockReset();
  mocks.krakenPublic.mockReset();
});

// Route alpaca calls by path: buys first hit /v2/account for available cash.
function mockAlpacaAccountAndOrders(cash: string, orderResponse: any) {
  mocks.alpaca.mockImplementation(async (_conn: any, path: string) => {
    if (path === "/v2/account") {
      return {
        ok: true,
        status: 200,
        data: { cash, buying_power: cash, non_marginable_buying_power: cash },
      };
    }
    return orderResponse;
  });
}

function mockOandaSummary(marginAvailable: string) {
  mocks.oanda.mockResolvedValue({
    ok: true,
    status: 200,
    data: { account: { marginAvailable } },
  });
}

function alpacaOrderCalls() {
  return mocks.alpaca.mock.calls.filter((c: any[]) => c[1] === "/v2/orders");
}

describe("pruneOldAutoTradeEvents", () => {
  it("prunes old events AND old alert-dedupe records, throttled to once per hour", async () => {
    await pruneOldAutoTradeEvents();
    expect(mocks.deleteCalls).toHaveLength(2);
    const tables = mocks.deleteCalls.map((c) => c.table.name);
    expect(tables).toContain("auto_trade_events");
    expect(tables).toContain("auto_trade_notifications");
    // cutoff for dedupe records is a Date a few days back, compared against sentAt
    const notifCall = mocks.deleteCalls.find(
      (c) => c.table.name === "auto_trade_notifications",
    )!;
    expect(notifCall.where.lt[0]).toBe("sentAt");
    expect(notifCall.where.lt[1]).toBeInstanceOf(Date);
    expect(notifCall.where.lt[1].getTime()).toBeLessThan(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    );

    // throttled: immediate second call is a no-op
    await pruneOldAutoTradeEvents();
    expect(mocks.deleteCalls).toHaveLength(2);
  });

  it("still prunes dedupe records when the events prune fails (and never throws)", async () => {
    vi.useFakeTimers();
    try {
      // step past the hourly throttle left by the previous test
      vi.setSystemTime(Date.now() + 61 * 60 * 1000);
      mocks.deleteFailFor = "auto_trade_events";
      await expect(pruneOldAutoTradeEvents()).resolves.toBeUndefined();
      expect(mocks.deleteCalls.map((c) => c.table.name)).toEqual([
        "auto_trade_notifications",
      ]);
    } finally {
      mocks.deleteFailFor = null;
      vi.useRealTimers();
    }
  });
});

describe("executeRealTrades — routing", () => {
  it("returns 0 and places no orders for unroutable instruments", async () => {
    const placed = await executeRealTrades({
      symbol: "FAKECOIN-PERP",
      assetType: "futures",
      side: "buy",
      notionalHint: 25,
    });
    expect(placed).toBe(0);
    expect(mocks.alpaca).not.toHaveBeenCalled();
    expect(mocks.oandaMarketOrderNotional).not.toHaveBeenCalled();
  });
});

describe("executeRealTrades — Alpaca", () => {
  it("places a buy order capped at the per-trade max and records an executed event", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mockAlpacaAccountAndOrders("1000", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });

    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 500,
    });

    expect(placed).toBe(1);
    expect(alpacaOrderCalls()).toHaveLength(1);
    const [conn, path, init] = alpacaOrderCalls()[0];
    expect(conn).toEqual({
      apiKey: "dec(enc-key)",
      apiSecret: "dec(enc-secret)",
      mode: "paper",
    });
    expect(path).toBe("/v2/orders");
    expect(init.body).toMatchObject({
      symbol: "BTC/USD",
      side: "buy",
      notional: "50.00",
      type: "market",
      time_in_force: "gtc",
    });
    expect(mocks.insertedEvents).toHaveLength(1);
    expect(mocks.insertedEvents[0]).toMatchObject({
      userId: "user-1",
      broker: "alpaca",
      outcome: "executed",
      notionalUsd: "50.00",
    });
  });

  it("uses day time-in-force for stocks", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mockAlpacaAccountAndOrders("1000", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });
    await executeRealTrades({
      symbol: "AAPL",
      assetType: "stock",
      side: "buy",
      notionalHint: 10,
    });
    expect(alpacaOrderCalls()[0][2].body).toMatchObject({
      symbol: "AAPL",
      time_in_force: "day",
      notional: "10.00",
    });
  });

  it("skips with a wash_trade event when the opposite side executed moments ago", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.washTradeRows = [{ id: 99 }];
    mockAlpacaAccountAndOrders("1000", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });

    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 500,
    });

    expect(placed).toBe(0);
    expect(mocks.alpaca).not.toHaveBeenCalled();
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "wash_trade",
    });
  });

  it("exit-guard sells bypass the wash-trade guard", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.washTradeRows = [{ id: 99 }];
    mocks.alpaca.mockImplementation(
      async (_conn: any, path: string, init?: any) => {
        if (path.startsWith("/v2/positions/"))
          return {
            ok: true,
            status: 200,
            data: { market_value: "40", qty_available: "0.001" },
          };
        if (path === "/v2/orders" && init?.method === "POST")
          return { ok: true, status: 200, data: { id: "order-2" } };
        return { ok: true, status: 200, data: {} };
      },
    );

    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 40,
      exitGuard: "stop_loss",
      strategy: "daytrade",
    });

    expect(placed).toBe(1);
  });

  it("skips a crypto buy below Alpaca's $10 minimum with a too_small event", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mockAlpacaAccountAndOrders("1000", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });

    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 5,
    });

    expect(placed).toBe(0);
    expect(mocks.alpaca).toHaveBeenCalledTimes(1); // only the /v2/account cash check
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "too_small",
    });
  });

  it("skips with a daily_limit event when the pre-check shows less than $1 remaining", async () => {
    mocks.selectRows = [alpacaConnRow({ spentTodayUsd: "99.50" })];
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 25,
    });
    expect(placed).toBe(0);
    expect(mocks.alpaca).not.toHaveBeenCalled();
    expect(mocks.updateCalls).toHaveLength(0); // no reservation attempted
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "daily_limit",
    });
  });

  it("resets the spent amount when spendDate is a previous day", async () => {
    mocks.selectRows = [
      alpacaConnRow({ spentTodayUsd: "99.50", spendDate: "2000-01-01" }),
    ];
    mockAlpacaAccountAndOrders("1000", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 25,
    });
    expect(placed).toBe(1);
  });

  it("caps notional at the remaining daily budget", async () => {
    mocks.selectRows = [alpacaConnRow({ spentTodayUsd: "90" })]; // $10 remaining
    mockAlpacaAccountAndOrders("1000", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });
    await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 500,
    });
    expect(alpacaOrderCalls()[0][2].body.notional).toBe("10.00");
  });

  it("caps a buy at the account's available cash and skips when cash is under $1", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mockAlpacaAccountAndOrders("17.505", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });
    await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 500,
    });
    expect(alpacaOrderCalls()[0][2].body.notional).toBe("17.50");

    mocks.alpaca.mockReset();
    mocks.insertedEvents.length = 0;
    mockAlpacaAccountAndOrders("0.40", {
      ok: true,
      status: 200,
      data: { id: "order-2" },
    });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 500,
    });
    expect(placed).toBe(0);
    expect(alpacaOrderCalls()).toHaveLength(0);
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "insufficient_cash",
    });
  });

  it("skips without ordering when the atomic reservation is rejected (concurrent limit hit)", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.reserveResults = [[]]; // guarded UPDATE matched no rows
    mockAlpacaAccountAndOrders("1000", {
      ok: true,
      status: 200,
      data: { id: "order-1" },
    });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 25,
    });
    expect(placed).toBe(0);
    expect(alpacaOrderCalls()).toHaveLength(0);
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "daily_limit",
    });
  });

  it("reserves budget before ordering and refunds it when the broker rejects", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mockAlpacaAccountAndOrders("1000", {
      ok: false,
      status: 422,
      data: { message: "insufficient buying power" },
    });

    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 25,
    });

    expect(placed).toBe(0);
    // 1st update = reservation, 2nd = refund
    expect(mocks.updateCalls).toHaveLength(2);
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "rejected",
      reasonCode: "broker_rejected",
    });
    expect(mocks.insertedEvents[0].message).toContain(
      "insufficient buying power",
    );
  });

  it("skips a sell with a no_position event when no position exists", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.alpaca.mockResolvedValueOnce({ ok: false, status: 404, data: null }); // position lookup fails
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 25,
    });
    expect(placed).toBe(0);
    expect(mocks.alpaca).toHaveBeenCalledTimes(1); // only the position lookup, no order
    expect(mocks.alpaca.mock.calls[0][1]).toBe("/v2/positions/BTCUSD");
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "no_position",
    });
  });

  it("caps a sell at the position market value", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.alpaca
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { market_value: "7.505" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { id: "order-1" },
      });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 500,
    });
    expect(placed).toBe(1);
    expect(mocks.alpaca.mock.calls[1][2].body.notional).toBe("7.50");
  });

  it("sells by quantity instead of notional when selling (nearly) the whole position", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.alpaca
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          market_value: "7.505",
          qty_available: "0.000067142",
          qty: "0.000068513",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { id: "order-1" },
      });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 500,
    });
    expect(placed).toBe(1);
    const body = mocks.alpaca.mock.calls[1][2].body;
    expect(body.qty).toBe("0.000067142");
    expect(body.notional).toBeUndefined();
  });

  it("does not cap a sell at the per-trade max (full exit allowed)", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.alpaca
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { market_value: "5000" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { id: "order-1" },
      });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 500,
    });
    expect(placed).toBe(1);
    expect(mocks.alpaca.mock.calls[1][2].body.notional).toBe("500.00");
  });

  it("executes a sell even when the daily limit is exhausted (sells free capital)", async () => {
    mocks.selectRows = [alpacaConnRow({ spentTodayUsd: "100" })]; // limit fully spent
    mocks.alpaca
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { market_value: "200" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { id: "order-1" },
      });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 25,
    });
    expect(placed).toBe(1);
    expect(mocks.insertedEvents[0]).toMatchObject({ outcome: "executed" });
  });

  it("refunds today's spend when a sell executes (allotment can be re-deployed)", async () => {
    mocks.selectRows = [alpacaConnRow({ spentTodayUsd: "80" })];
    mocks.alpaca
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { market_value: "200" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { id: "order-1" },
      });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 25,
    });
    expect(placed).toBe(1);
    // no reservation for sells; exactly one update = the refund
    expect(mocks.updateCalls).toHaveLength(1);
  });

  it("does not touch the budget when a sell is rejected by the broker", async () => {
    mocks.selectRows = [alpacaConnRow()];
    mocks.alpaca
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { market_value: "200" },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        data: { message: "rejected" },
      });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "sell",
      notionalHint: 25,
    });
    expect(placed).toBe(0);
    expect(mocks.updateCalls).toHaveLength(0); // no reservation, no refund
  });

  it("records an error event when the broker call throws, and continues to other users", async () => {
    mocks.selectRows = [
      alpacaConnRow({ id: 1, userId: "user-1" }),
      alpacaConnRow({ id: 3, userId: "user-3" }),
    ];
    let first = true;
    mocks.alpaca.mockImplementation(async (_conn: any, path: string) => {
      if (first) {
        first = false;
        throw new Error("boom");
      }
      if (path === "/v2/account")
        return {
          ok: true,
          status: 200,
          data: {
            cash: "1000",
            buying_power: "1000",
            non_marginable_buying_power: "1000",
          },
        };
      return { ok: true, status: 200, data: { id: "order-2" } };
    });
    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 25,
    });
    expect(placed).toBe(1);
    expect(mocks.insertedEvents[0]).toMatchObject({
      userId: "user-1",
      outcome: "rejected",
      reasonCode: "error",
    });
    expect(mocks.insertedEvents[1]).toMatchObject({
      userId: "user-3",
      outcome: "executed",
    });
  });
});

describe("executeRealTrades — Kraken", () => {
  it("places a capped Spot order for an opted-in Kraken account", async () => {
    mocks.krakenRows = [krakenConnRow()];
    mocks.krakenPrivate.mockImplementation(
      async (_creds: any, endpoint: string) =>
        endpoint === "Balance"
          ? { result: { ZUSD: "250" } }
          : { result: { txid: ["kraken-order-1"] } },
    );
    mocks.krakenPublic.mockResolvedValue({
      result: { "BTC/USD": { c: ["50000"], o: "48000", v: ["1", "2"] } },
    });

    const placed = await executeRealTrades({
      symbol: "BTC",
      assetType: "crypto",
      side: "buy",
      notionalHint: 200,
      strategy: "daytrade",
    });

    expect(placed).toBe(1);
    expect(mocks.krakenPrivate).toHaveBeenCalledWith(
      { apiKey: "dec(enc-kraken-key)", apiSecret: "dec(enc-kraken-secret)" },
      "AddOrder",
      {
        pair: "XBTUSD",
        type: "buy",
        ordertype: "market",
        volume: "0.00080000000",
      },
    );
    expect(mocks.insertedEvents).toContainEqual(
      expect.objectContaining({
        userId: "user-3",
        broker: "kraken",
        outcome: "executed",
        notionalUsd: "40.00",
        strategy: "daytrade",
      }),
    );
  });
});

describe("executeRealTrades — OANDA", () => {
  it("places a forex order via the routed OANDA instrument", async () => {
    mocks.selectRows = [oandaConnRow()];
    mockOandaSummary("1000");
    mocks.oandaMarketOrderNotional.mockResolvedValue({
      ok: true,
      status: 201,
      data: {},
    });

    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "buy",
      notionalHint: 30,
    });

    expect(placed).toBe(1);
    const [conn, instrument, side, notional] =
      mocks.oandaMarketOrderNotional.mock.calls[0];
    expect(conn).toEqual({
      apiToken: "dec(enc-token)",
      accountId: "acct-123",
      mode: "practice",
    });
    expect(instrument).toBe("EUR_USD");
    expect(side).toBe("buy");
    expect(notional).toBe(30);
    expect(mocks.insertedEvents[0]).toMatchObject({
      broker: "oanda",
      outcome: "executed",
    });
  });

  it("skips when the OANDA daily limit is already spent", async () => {
    mocks.selectRows = [oandaConnRow({ spentTodayUsd: "100" })];
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "buy",
      notionalHint: 30,
    });
    expect(placed).toBe(0);
    expect(mocks.oandaMarketOrderNotional).not.toHaveBeenCalled();
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "daily_limit",
    });
  });

  it("skips without ordering when the atomic reservation fails", async () => {
    mocks.selectRows = [oandaConnRow()];
    mocks.reserveResults = [[]];
    mockOandaSummary("1000");
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "buy",
      notionalHint: 30,
    });
    expect(placed).toBe(0);
    expect(mocks.oandaMarketOrderNotional).not.toHaveBeenCalled();
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "daily_limit",
    });
  });

  it("executes an OANDA sell even when the daily limit is exhausted and refunds today's spend", async () => {
    mocks.selectRows = [oandaConnRow({ spentTodayUsd: "100" })];
    mocks.oanda.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { position: { long: { units: "100", averagePrice: "1.0" } } },
    });
    mocks.oandaMarketOrderNotional.mockResolvedValue({
      ok: true,
      status: 201,
      data: {},
    });
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "sell",
      notionalHint: 30,
    });
    expect(placed).toBe(1);
    expect(mocks.updateCalls).toHaveLength(1); // refund only, no reservation
  });

  it("refunds the reservation when OANDA rejects the order", async () => {
    mocks.selectRows = [oandaConnRow()];
    mockOandaSummary("1000");
    mocks.oandaMarketOrderNotional.mockResolvedValue({
      ok: false,
      status: 400,
      data: { orderRejectTransaction: { rejectReason: "MARKET_HALTED" } },
    });
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "buy",
      notionalHint: 30,
    });
    expect(placed).toBe(0);
    expect(mocks.updateCalls).toHaveLength(2); // reservation + refund
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "rejected",
      reasonCode: "broker_rejected",
    });
    expect(mocks.insertedEvents[0].message).toContain("closed right now");
  });

  it("surfaces the cancel reason when OANDA returns 201 with an orderCancelTransaction", async () => {
    mocks.selectRows = [oandaConnRow()];
    mockOandaSummary("1000");
    mocks.oandaMarketOrderNotional.mockResolvedValue({
      ok: false,
      status: 201,
      data: { orderCancelTransaction: { reason: "MARKET_HALTED" } },
    });
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "buy",
      notionalHint: 30,
    });
    expect(placed).toBe(0);
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "rejected",
      reasonCode: "broker_rejected",
    });
    expect(mocks.insertedEvents[0].message).toContain("closed right now");
  });

  it("skips a sell when there is no long position", async () => {
    mocks.selectRows = [oandaConnRow()];
    mocks.oanda.mockResolvedValue({
      ok: true,
      status: 200,
      data: { position: { long: { units: "0" } } },
    });
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "sell",
      notionalHint: 30,
    });
    expect(placed).toBe(0);
    expect(mocks.oandaMarketOrderNotional).not.toHaveBeenCalled();
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "no_position",
    });
  });

  it("caps a buy at the available margin and skips when under $1", async () => {
    mocks.selectRows = [oandaConnRow()];
    mockOandaSummary("12.505");
    mocks.oandaMarketOrderNotional.mockResolvedValue({
      ok: true,
      status: 201,
      data: {},
    });
    await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "buy",
      notionalHint: 500,
    });
    expect(mocks.oandaMarketOrderNotional.mock.calls[0][3]).toBe(12.5);

    mocks.oanda.mockReset();
    mocks.oandaMarketOrderNotional.mockReset();
    mocks.insertedEvents.length = 0;
    mockOandaSummary("0.25");
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "buy",
      notionalHint: 500,
    });
    expect(placed).toBe(0);
    expect(mocks.oandaMarketOrderNotional).not.toHaveBeenCalled();
    expect(mocks.insertedEvents[0]).toMatchObject({
      outcome: "skipped",
      reasonCode: "insufficient_cash",
    });
  });

  it("caps a sell at the long position value", async () => {
    mocks.selectRows = [oandaConnRow()];
    mocks.oanda.mockResolvedValue({
      ok: true,
      status: 200,
      data: { position: { long: { units: "10", averagePrice: "1.25" } } },
    });
    mocks.oandaMarketOrderNotional.mockResolvedValue({
      ok: true,
      status: 201,
      data: {},
    });
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "sell",
      notionalHint: 500,
    });
    expect(placed).toBe(1);
    expect(mocks.oandaMarketOrderNotional.mock.calls[0][3]).toBe(12.5);
  });

  it("does not cap an OANDA sell at the per-trade max (full exit allowed)", async () => {
    mocks.selectRows = [oandaConnRow()];
    // Position value 5000 (4000 units @ 1.25) — well above the per-trade max
    mocks.oanda.mockResolvedValue({
      ok: true,
      status: 200,
      data: { position: { long: { units: "4000", averagePrice: "1.25" } } },
    });
    mocks.oandaMarketOrderNotional.mockResolvedValue({
      ok: true,
      status: 201,
      data: {},
    });
    const placed = await executeRealTrades({
      symbol: "EURUSD",
      assetType: "forex",
      side: "sell",
      notionalHint: 500,
    });
    expect(placed).toBe(1);
    expect(mocks.oandaMarketOrderNotional.mock.calls[0][3]).toBe(500);
  });
});
