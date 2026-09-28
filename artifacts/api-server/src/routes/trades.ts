import { Router, type IRouter, type Request, type Response } from "express";
import { PlaceTradeBody } from "@workspace/api-zod";
import { getCoinBySymbol } from "../lib/coins";
import { listBrokers, type NormalizedTrade } from "../lib/brokers";
import {
  resolveBrokerRoute,
  resolveConnectedBrokerRoute,
} from "../lib/brokerRouting";

const router: IRouter = Router();

router.get("/trades", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user!.id;
    const adapters = listBrokers();
    const trades: NormalizedTrade[] = [];

    await Promise.all(
      adapters.map(async (adapter) => {
        const conn = await adapter.getConnection(userId);
        if (!conn) return;
        const brokerTrades = await adapter.getRecentTrades(conn.creds, 50);
        trades.push(...brokerTrades);
      }),
    );

    trades.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.json(trades.slice(0, 100));
  } catch (err) {
    req.log.error({ err }, "Failed to get trades");
    res.status(500).json({ error: "Failed to get trades" });
  }
});

router.post("/trades", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = PlaceTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "Invalid request: symbol, side (buy/sell) and notional (min $1) are required",
    });
    return;
  }
  const { symbol, side, notional } = parsed.data;
  const coin = getCoinBySymbol(symbol);
  if (!coin) {
    res.status(400).json({ error: "Unknown symbol" });
    return;
  }
  const defaultRoute = resolveBrokerRoute(symbol, coin.assetType);
  if (!defaultRoute) {
    res.status(400).json({
      error: "This instrument is not tradable through a linked broker",
    });
    return;
  }

  try {
    const userId = req.user!.id;
    const route = await resolveConnectedBrokerRoute(
      userId,
      symbol,
      coin.assetType,
    );
    if (!route) {
      res.status(400).json({
        error: "Connect a supported broker account to trade this instrument",
      });
      return;
    }
    const { adapter, connection } = route;

    // Cheap pre-flight: skip orders the broker is guaranteed to reject
    // (closed market, instrument not offered to this account).
    const tradability = await adapter.checkTradeability(
      connection.creds,
      route.brokerSymbol,
    );
    if (!tradability.tradeable) {
      const msg =
        tradability.reason === "market_closed"
          ? "The market for this instrument is closed right now (forex and CFD markets close on weekends)"
          : `This instrument is not tradeable by your ${adapter.displayName} account`;
      res.status(400).json({ error: msg });
      return;
    }

    const result = await adapter.placeMarketOrder(connection.creds, {
      brokerSymbol: route.brokerSymbol,
      side,
      notionalUsd: notional,
      effectiveAssetType: route.effectiveAssetType,
    });
    if (!result.ok) {
      req.log.warn(
        {
          status: result.status,
          broker: adapter.id,
          reason: result.rejectReason,
        },
        "Broker order rejected",
      );
      res.status(400).json({
        error:
          result.rejectReason ?? `${adapter.displayName} rejected the order`,
      });
      return;
    }

    req.log.info(
      { symbol, side, notional, broker: adapter.id },
      "Real-money trade placed",
    );
    res.status(201).json({
      id: `${adapter.id}-${result.orderId || Date.now()}`,
      symbol,
      name: coin.name,
      side,
      quantity: result.fillQty ?? 0,
      price: result.fillPrice ?? 0,
      total: notional,
      createdAt: result.fillTime ?? new Date().toISOString(),
      logoUrl: coin.logoUrl,
      broker: adapter.id,
      status: result.orderStatus ?? "accepted",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to execute trade");
    res.status(500).json({ error: "Failed to execute trade" });
  }
});

export default router;
