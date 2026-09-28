import { Router, type IRouter, type Request, type Response } from "express";
import { listBrokers, type NormalizedHolding } from "../lib/brokers";

const router: IRouter = Router();

router.get("/portfolio", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user!.id;
    const adapters = listBrokers();
    const connections = await Promise.all(adapters.map((a) => a.getConnection(userId)));

    let usdBalance = 0;
    let totalValue = 0;
    let totalInvested = 0;
    const holdings: NormalizedHolding[] = [];
    const connectedFlags: Record<string, boolean> = {};

    await Promise.all(
      adapters.map(async (adapter, i) => {
        const conn = connections[i];
        connectedFlags[adapter.id] = Boolean(conn);
        if (!conn) return;
        const [balances, brokerHoldings] = await Promise.all([
          adapter.getBalances(conn.creds),
          adapter.getHoldings(conn.creds),
        ]);
        if (balances) {
          usdBalance += balances.cashUsd;
          totalValue += balances.equityUsd;
        }
        for (const h of brokerHoldings) {
          totalInvested += Math.abs(h.quantity) * h.avgBuyPrice;
          holdings.push(h);
        }
      })
    );

    const totalPnl = holdings.reduce((s, h) => s + h.pnl, 0);
    res.json({
      usdBalance,
      totalValue,
      totalInvested,
      totalPnl,
      totalPnlPercent: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
      alpacaConnected: connectedFlags["alpaca"] ?? false,
      oandaConnected: connectedFlags["oanda"] ?? false,
      holdings,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get portfolio");
    res.status(500).json({ error: "Failed to get portfolio" });
  }
});

export default router;
