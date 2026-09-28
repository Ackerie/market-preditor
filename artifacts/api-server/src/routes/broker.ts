import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  brokerConnectionsTable,
  oandaConnectionsTable,
  krakenConnectionsTable,
  type BrokerConnection,
  type OandaConnection,
} from "@workspace/db";
import {
  ConnectBrokerBody,
  PlaceBrokerOrderBody,
  UpdateBrokerAutoTradeSettingsBody,
  ConnectOandaBody,
  UpdateOandaAutoTradeSettingsBody,
  ConnectKrakenBody,
} from "@workspace/api-zod";
import { encryptCredential, decryptCredential } from "../lib/credentialCrypto";
import { alpaca } from "../lib/alpaca";
import { oanda } from "../lib/oanda";
import { krakenPrivate } from "../lib/kraken";
import { krakenAdapter } from "../lib/brokers/krakenAdapter";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return `${key.slice(0, 4)}${"*".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

function num(v: unknown): number {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

async function getConnection(
  userId: string,
): Promise<BrokerConnection | undefined> {
  const [conn] = await db
    .select()
    .from(brokerConnectionsTable)
    .where(eq(brokerConnectionsTable.userId, userId));
  if (!conn) return undefined;
  return {
    ...conn,
    apiKey: decryptCredential(conn.apiKey),
    apiSecret: decryptCredential(conn.apiSecret),
  };
}

function statusPayload(conn: BrokerConnection, account: any) {
  return {
    connected: true,
    mode: conn.mode,
    apiKeyMasked: maskKey(conn.apiKey),
    accountNumber: account?.account_number ?? "",
    currency: account?.currency ?? "USD",
    cash: num(account?.cash),
    buyingPower: num(account?.buying_power),
    equity: num(account?.equity),
    portfolioValue: num(account?.portfolio_value),
    status: account?.status ?? "UNKNOWN",
    longMarketValue: num(account?.long_market_value),
    shortMarketValue: num(account?.short_market_value),
    daytradeCount: num(account?.daytrade_count),
    patternDayTrader: Boolean(account?.pattern_day_trader),
    shortingEnabled: Boolean(account?.shorting_enabled),
    multiplier: num(account?.multiplier),
    maintenanceMargin: num(account?.maintenance_margin),
    initialMargin: num(account?.initial_margin),
    lastEquity: num(account?.last_equity),
    createdAt: account?.created_at ?? "",
  };
}

router.post("/broker/connect", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = ConnectBrokerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { apiKey, apiSecret, mode } = parsed.data;

  const check = await alpaca({ apiKey, apiSecret, mode }, "/v2/account");
  if (!check.ok) {
    req.log.warn(
      { status: check.status },
      "Alpaca credential validation failed",
    );
    res.status(400).json({
      error:
        check.status === 401 || check.status === 403
          ? "Alpaca rejected these credentials. Double-check the API key, secret, and whether they are for paper or live trading."
          : "Could not verify credentials with Alpaca. Please try again.",
    });
    return;
  }

  const userId = req.user!.id;
  const encKey = encryptCredential(apiKey);
  const encSecret = encryptCredential(apiSecret);
  await db
    .insert(brokerConnectionsTable)
    .values({ userId, apiKey: encKey, apiSecret: encSecret, mode })
    .onConflictDoUpdate({
      target: brokerConnectionsTable.userId,
      set: { apiKey: encKey, apiSecret: encSecret, mode },
    });

  const conn = (await getConnection(userId))!;
  res.json(statusPayload(conn, check.data));
});

router.get("/broker/status", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const conn = await getConnection(req.user!.id);
  if (!conn) {
    res.json({ connected: false });
    return;
  }
  const account = await alpaca(conn, "/v2/account");
  if (!account.ok) {
    res.json({
      connected: true,
      mode: conn.mode,
      apiKeyMasked: maskKey(conn.apiKey),
      status: "UNREACHABLE",
    });
    return;
  }
  res.json(statusPayload(conn, account.data));
});

router.delete("/broker/disconnect", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  await db
    .delete(brokerConnectionsTable)
    .where(eq(brokerConnectionsTable.userId, req.user!.id));
  res.json({ success: true });
});

router.get("/broker/positions", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const conn = await getConnection(req.user!.id);
  if (!conn) {
    res.status(400).json({ error: "No broker connected" });
    return;
  }
  const result = await alpaca(conn, "/v2/positions");
  if (!result.ok) {
    res.status(400).json({ error: "Failed to fetch positions from Alpaca" });
    return;
  }
  res.json(
    (result.data as any[]).map((p) => ({
      symbol: p.symbol,
      assetClass: p.asset_class ?? "us_equity",
      qty: num(p.qty),
      marketValue: num(p.market_value),
      avgEntryPrice: num(p.avg_entry_price),
      currentPrice: num(p.current_price),
      unrealizedPl: num(p.unrealized_pl),
      unrealizedPlPercent: num(p.unrealized_plpc) * 100,
      side: p.side ?? "long",
    })),
  );
});

function orderPayload(o: any) {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    notional: numOrNull(o.notional),
    qty: numOrNull(o.qty),
    filledQty: numOrNull(o.filled_qty),
    filledAvgPrice: numOrNull(o.filled_avg_price),
    status: o.status,
    createdAt: o.created_at ?? o.submitted_at ?? new Date().toISOString(),
  };
}

router.get("/broker/orders", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const conn = await getConnection(req.user!.id);
  if (!conn) {
    res.status(400).json({ error: "No broker connected" });
    return;
  }
  const result = await alpaca(
    conn,
    "/v2/orders?status=all&limit=25&direction=desc",
  );
  if (!result.ok) {
    res.status(400).json({ error: "Failed to fetch orders from Alpaca" });
    return;
  }
  res.json((result.data as any[]).map(orderPayload));
});

router.post("/broker/orders", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = PlaceBrokerOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "Invalid order: symbol, side (buy/sell) and notional (min $1) are required",
    });
    return;
  }
  const conn = await getConnection(req.user!.id);
  if (!conn) {
    res.status(400).json({ error: "No broker connected" });
    return;
  }
  const { symbol, side, notional } = parsed.data;
  const result = await alpaca(conn, "/v2/orders", {
    method: "POST",
    body: {
      symbol: symbol.toUpperCase(),
      side,
      notional: notional.toFixed(2),
      type: "market",
      time_in_force: "day",
    },
  });
  if (!result.ok) {
    req.log.warn(
      { status: result.status, alpaca: result.data },
      "Alpaca order rejected",
    );
    res
      .status(400)
      .json({ error: result.data?.message ?? "Alpaca rejected the order" });
    return;
  }
  req.log.info(
    { symbol, side, notional, mode: conn.mode },
    "Real-money order placed",
  );
  res.json(orderPayload(result.data));
});

function autoTradePayload(row: BrokerConnection) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    enabled: row.autoTradeEnabled,
    maxPerTradeUsd: parseFloat(row.autoTradeMaxUsd),
    dailyLimitUsd: parseFloat(row.autoTradeDailyLimitUsd),
    spentTodayUsd: row.spendDate === today ? parseFloat(row.spentTodayUsd) : 0,
    mode: row.mode,
  };
}

router.get("/broker/auto-trade", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const [row] = await db
    .select()
    .from(brokerConnectionsTable)
    .where(eq(brokerConnectionsTable.userId, req.user!.id));
  if (!row) {
    res.status(400).json({ error: "No broker connected" });
    return;
  }
  res.json(autoTradePayload(row));
});

router.put("/broker/auto-trade", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = UpdateBrokerAutoTradeSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings" });
    return;
  }
  const [row] = await db
    .select()
    .from(brokerConnectionsTable)
    .where(eq(brokerConnectionsTable.userId, req.user!.id));
  if (!row) {
    res.status(400).json({ error: "No broker connected" });
    return;
  }
  const updates: Partial<typeof brokerConnectionsTable.$inferInsert> = {};
  if (parsed.data.enabled !== undefined)
    updates.autoTradeEnabled = parsed.data.enabled;
  if (parsed.data.maxPerTradeUsd !== undefined)
    updates.autoTradeMaxUsd = parsed.data.maxPerTradeUsd.toFixed(2);
  if (parsed.data.dailyLimitUsd !== undefined)
    updates.autoTradeDailyLimitUsd = parsed.data.dailyLimitUsd.toFixed(2);
  const [updated] = await db
    .update(brokerConnectionsTable)
    .set(updates)
    .where(eq(brokerConnectionsTable.id, row.id))
    .returning();
  req.log.info(
    {
      userId: req.user!.id,
      enabled: updated.autoTradeEnabled,
      maxPerTradeUsd: updated.autoTradeMaxUsd,
      dailyLimitUsd: updated.autoTradeDailyLimitUsd,
    },
    "Real auto-trade settings updated",
  );
  res.json(autoTradePayload(updated));
});

async function getOandaConn(
  userId: string,
): Promise<OandaConnection | undefined> {
  const [conn] = await db
    .select()
    .from(oandaConnectionsTable)
    .where(eq(oandaConnectionsTable.userId, userId));
  if (!conn) return undefined;
  return { ...conn, apiToken: decryptCredential(conn.apiToken) };
}

function maskAccountId(id: string): string {
  if (id.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, id.length - 4))}${id.slice(-4)}`;
}

function oandaStatusPayload(conn: OandaConnection, account: any) {
  const a = account?.account ?? {};
  return {
    connected: true,
    mode: conn.mode,
    accountIdMasked: maskAccountId(conn.accountId),
    currency: a.currency ?? "USD",
    balance: num(a.balance),
    nav: num(a.NAV),
    unrealizedPl: num(a.unrealizedPL),
    marginAvailable: num(a.marginAvailable),
    openPositionCount: parseInt(String(a.openPositionCount ?? "0"), 10) || 0,
    marginUsed: num(a.marginUsed),
    marginRate: num(a.marginRate),
    openTradeCount: parseInt(String(a.openTradeCount ?? "0"), 10) || 0,
    pendingOrderCount: parseInt(String(a.pendingOrderCount ?? "0"), 10) || 0,
    realizedPl: num(a.pl),
    withdrawalLimit: num(a.withdrawalLimit),
    alias: a.alias ?? "",
    createdTime: a.createdTime ?? "",
  };
}

router.post("/broker/oanda/connect", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = ConnectOandaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "Invalid request body: apiToken, accountId, and mode (practice/live) are required",
    });
    return;
  }
  const { apiToken, accountId, mode } = parsed.data;

  const check = await oanda(
    { apiToken, accountId, mode },
    `/v3/accounts/${accountId}/summary`,
  );
  if (!check.ok) {
    req.log.warn(
      { status: check.status },
      "OANDA credential validation failed",
    );
    res.status(400).json({
      error:
        check.status === 401 || check.status === 403 || check.status === 404
          ? "OANDA rejected these credentials. Double-check the API token, account ID, and whether they are for a practice or live account."
          : "Could not verify credentials with OANDA. Please try again.",
    });
    return;
  }

  const userId = req.user!.id;
  const encToken = encryptCredential(apiToken);
  await db
    .insert(oandaConnectionsTable)
    .values({ userId, apiToken: encToken, accountId, mode })
    .onConflictDoUpdate({
      target: oandaConnectionsTable.userId,
      set: { apiToken: encToken, accountId, mode },
    });

  const conn = (await getOandaConn(userId))!;
  res.json(oandaStatusPayload(conn, check.data));
});

router.get("/broker/oanda/status", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const conn = await getOandaConn(req.user!.id);
  if (!conn) {
    res.json({ connected: false });
    return;
  }
  const account = await oanda(conn, `/v3/accounts/${conn.accountId}/summary`);
  if (!account.ok) {
    res.json({
      connected: true,
      mode: conn.mode,
      accountIdMasked: maskAccountId(conn.accountId),
    });
    return;
  }
  res.json(oandaStatusPayload(conn, account.data));
});

router.delete(
  "/broker/oanda/disconnect",
  async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    await db
      .delete(oandaConnectionsTable)
      .where(eq(oandaConnectionsTable.userId, req.user!.id));
    res.json({ success: true });
  },
);

function oandaAutoTradePayload(row: OandaConnection) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    enabled: row.autoTradeEnabled,
    maxPerTradeUsd: parseFloat(row.autoTradeMaxUsd),
    dailyLimitUsd: parseFloat(row.autoTradeDailyLimitUsd),
    spentTodayUsd: row.spendDate === today ? parseFloat(row.spentTodayUsd) : 0,
    mode: row.mode,
  };
}

router.get("/broker/oanda/auto-trade", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const [row] = await db
    .select()
    .from(oandaConnectionsTable)
    .where(eq(oandaConnectionsTable.userId, req.user!.id));
  if (!row) {
    res.status(400).json({ error: "No OANDA account connected" });
    return;
  }
  res.json(oandaAutoTradePayload(row));
});

router.put("/broker/oanda/auto-trade", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = UpdateOandaAutoTradeSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings" });
    return;
  }
  const [row] = await db
    .select()
    .from(oandaConnectionsTable)
    .where(eq(oandaConnectionsTable.userId, req.user!.id));
  if (!row) {
    res.status(400).json({ error: "No OANDA account connected" });
    return;
  }
  const updates: Partial<typeof oandaConnectionsTable.$inferInsert> = {};
  if (parsed.data.enabled !== undefined)
    updates.autoTradeEnabled = parsed.data.enabled;
  if (parsed.data.maxPerTradeUsd !== undefined)
    updates.autoTradeMaxUsd = parsed.data.maxPerTradeUsd.toFixed(2);
  if (parsed.data.dailyLimitUsd !== undefined)
    updates.autoTradeDailyLimitUsd = parsed.data.dailyLimitUsd.toFixed(2);
  const [updated] = await db
    .update(oandaConnectionsTable)
    .set(updates)
    .where(eq(oandaConnectionsTable.id, row.id))
    .returning();
  req.log.info(
    {
      userId: req.user!.id,
      enabled: updated.autoTradeEnabled,
      maxPerTradeUsd: updated.autoTradeMaxUsd,
      dailyLimitUsd: updated.autoTradeDailyLimitUsd,
    },
    "OANDA auto-trade settings updated",
  );
  res.json(oandaAutoTradePayload(updated));
});

router.post("/broker/kraken/connect", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = ConnectKrakenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "Invalid request body: API key and private API secret are required",
    });
    return;
  }
  const { apiKey, apiSecret } = parsed.data;
  let balanceResult: Record<string, string>;
  try {
    const balanceResponse = await krakenPrivate<Record<string, string>>(
      { apiKey, apiSecret },
      "Balance",
    );
    balanceResult = balanceResponse.result ?? {};
  } catch (error) {
    req.log.warn({ error }, "Kraken credential validation failed");
    res.status(400).json({
      error:
        "Kraken rejected these credentials. Check the API key, private secret, and Query Funds permission.",
    });
    return;
  }

  const userId = req.user!.id;
  try {
    await db
      .insert(krakenConnectionsTable)
      .values({
        userId,
        apiKey: encryptCredential(apiKey),
        apiSecret: encryptCredential(apiSecret),
      })
      .onConflictDoUpdate({
        target: krakenConnectionsTable.userId,
        set: {
          apiKey: encryptCredential(apiKey),
          apiSecret: encryptCredential(apiSecret),
        },
      });
  } catch (error) {
    req.log.error({ error, userId }, "Could not save Kraken credentials");
    res.status(500).json({
      error:
        "Kraken credentials were verified but could not be saved. Apply the latest database schema and try again.",
    });
    return;
  }

  const cash = numOrNull(balanceResult.ZUSD ?? balanceResult.USD);
  res.json({
    connected: true,
    mode: "live",
    apiKeyMasked: maskKey(apiKey),
    cash: cash ?? undefined,
    equity: cash ?? undefined,
  });
});

router.get("/broker/kraken/status", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const [row] = await db
    .select()
    .from(krakenConnectionsTable)
    .where(eq(krakenConnectionsTable.userId, req.user!.id));
  if (!row) {
    res.json({ connected: false });
    return;
  }
  const apiKey = decryptCredential(row.apiKey);
  const creds = {
    apiKey,
    apiSecret: decryptCredential(row.apiSecret),
  };
  const balances = await krakenAdapter.getBalances(creds);
  res.json({
    connected: true,
    mode: "live",
    apiKeyMasked: maskKey(apiKey),
    cash: balances?.cashUsd,
    equity: balances?.equityUsd,
  });
});

router.delete(
  "/broker/kraken/disconnect",
  async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    await db
      .delete(krakenConnectionsTable)
      .where(eq(krakenConnectionsTable.userId, req.user!.id));
    res.json({ success: true });
  },
);

function krakenAutoTradePayload(
  row: typeof krakenConnectionsTable.$inferSelect,
) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    enabled: row.autoTradeEnabled,
    maxPerTradeUsd: parseFloat(row.autoTradeMaxUsd),
    dailyLimitUsd: parseFloat(row.autoTradeDailyLimitUsd),
    spentTodayUsd: row.spendDate === today ? parseFloat(row.spentTodayUsd) : 0,
    mode: "live" as const,
  };
}

router.get("/broker/kraken/auto-trade", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const [row] = await db
    .select()
    .from(krakenConnectionsTable)
    .where(eq(krakenConnectionsTable.userId, req.user!.id));
  if (!row) {
    res.status(400).json({ error: "No Kraken account connected" });
    return;
  }
  res.json(krakenAutoTradePayload(row));
});

router.put("/broker/kraken/auto-trade", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = UpdateBrokerAutoTradeSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings" });
    return;
  }
  const [row] = await db
    .select()
    .from(krakenConnectionsTable)
    .where(eq(krakenConnectionsTable.userId, req.user!.id));
  if (!row) {
    res.status(400).json({ error: "No Kraken account connected" });
    return;
  }
  const updates: Partial<typeof krakenConnectionsTable.$inferInsert> = {};
  if (parsed.data.enabled !== undefined) {
    updates.autoTradeEnabled = parsed.data.enabled;
  }
  if (parsed.data.maxPerTradeUsd !== undefined) {
    updates.autoTradeMaxUsd = parsed.data.maxPerTradeUsd.toFixed(2);
  }
  if (parsed.data.dailyLimitUsd !== undefined) {
    updates.autoTradeDailyLimitUsd = parsed.data.dailyLimitUsd.toFixed(2);
  }
  const [updated] = await db
    .update(krakenConnectionsTable)
    .set(updates)
    .where(eq(krakenConnectionsTable.id, row.id))
    .returning();
  req.log.info(
    {
      userId: req.user!.id,
      enabled: updated.autoTradeEnabled,
      maxPerTradeUsd: updated.autoTradeMaxUsd,
      dailyLimitUsd: updated.autoTradeDailyLimitUsd,
    },
    "Kraken auto-trade settings updated",
  );
  res.json(krakenAutoTradePayload(updated));
});

export default router;
