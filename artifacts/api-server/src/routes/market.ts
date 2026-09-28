import { Router, type IRouter, type Request, type Response } from "express";
import { COINS, getLivePrice, get24hChange } from "../lib/coins";
import { alpaca } from "../lib/alpaca";
import { oanda } from "../lib/oanda";
import { getAlpacaConnection, getOandaConnection } from "../lib/connections";

const router: IRouter = Router();

router.get("/market-summary", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user!.id;
    const [alpacaConn, oandaConn] = await Promise.all([
      getAlpacaConnection(userId),
      getOandaConnection(userId),
    ]);

    let usdBalance = 0;
    let portfolioValue = 0;
    let portfolioChange24h = 0;

    if (alpacaConn) {
      const account = await alpaca(alpacaConn, "/v2/account");
      if (account.ok) {
        const equity = parseFloat(account.data?.equity ?? "0") || 0;
        const lastEquity = parseFloat(account.data?.last_equity ?? "0") || 0;
        usdBalance += parseFloat(account.data?.cash ?? "0") || 0;
        portfolioValue += equity;
        if (lastEquity > 0) portfolioChange24h += equity - lastEquity;
      }
    }

    if (oandaConn) {
      const account = await oanda(oandaConn, `/v3/accounts/${oandaConn.accountId}/summary`);
      if (account.ok) {
        usdBalance += parseFloat(account.data?.account?.balance ?? "0") || 0;
        portfolioValue += parseFloat(account.data?.account?.NAV ?? "0") || 0;
        portfolioChange24h += parseFloat(account.data?.account?.unrealizedPL ?? "0") || 0;
      }
    }

    const portfolioChange24hPercent =
      portfolioValue > 0 ? (portfolioChange24h / portfolioValue) * 100 : 0;

    const coins = COINS.map((coin) => ({
      symbol: coin.symbol,
      name: coin.name,
      price: getLivePrice(coin.symbol, coin.basePrice),
      change24h: get24hChange(coin.symbol),
      marketCap: coin.marketCap,
      volume: coin.volume,
      logoUrl: coin.logoUrl,
      assetType: coin.assetType,
    }));

    const sorted = [...coins].sort((a, b) => b.change24h - a.change24h);
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];

    const fearGreedIndex = Math.floor(Math.abs(Math.sin(Date.now() / 86400000) * 100));
    let fearGreedLabel = "Neutral";
    if (fearGreedIndex < 25) fearGreedLabel = "Extreme Fear";
    else if (fearGreedIndex < 45) fearGreedLabel = "Fear";
    else if (fearGreedIndex < 55) fearGreedLabel = "Neutral";
    else if (fearGreedIndex < 75) fearGreedLabel = "Greed";
    else fearGreedLabel = "Extreme Greed";

    res.json({
      portfolioValue,
      portfolioChange24h,
      portfolioChange24hPercent,
      usdBalance,
      alpacaConnected: Boolean(alpacaConn),
      oandaConnected: Boolean(oandaConn),
      topGainer,
      topLoser,
      totalCoins: COINS.length,
      fearGreedIndex,
      fearGreedLabel,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get market summary");
    res.status(500).json({ error: "Failed to get market summary" });
  }
});

export default router;
