import { Router } from "express";
import {
  ALL_ASSETS,
  get24hChange,
  getCoinBySymbol,
  getLivePrice,
  type AssetType,
} from "../lib/coins";
import { listBrokers } from "../lib/brokers";
import type { MarketQuote } from "../lib/brokers";
import { resolveConnectedBrokerRoute } from "../lib/brokerRouting";

const router = Router();

const VALID_ASSET_TYPES: AssetType[] = [
  "crypto",
  "stock",
  "forex",
  "futures",
  "commodity",
];

async function getLiveQuotes(
  userId: string,
  assets: typeof ALL_ASSETS,
): Promise<Map<string, MarketQuote>> {
  const quotes = new Map<string, MarketQuote>();
  await Promise.all(
    listBrokers().map(async (broker) => {
      const connection = await broker.getConnection(userId);
      if (!connection) return;
      const results = await broker.getMarketQuotes(connection.creds, assets);
      results.forEach((quote) => quotes.set(quote.symbol, quote));
    }),
  );
  return quotes;
}

router.get("/coins", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rawType = req.query.assetType;
  const assetType =
    typeof rawType === "string" &&
    VALID_ASSET_TYPES.includes(rawType as AssetType)
      ? (rawType as AssetType)
      : undefined;

  try {
    const source = assetType
      ? ALL_ASSETS.filter((c) => c.assetType === assetType)
      : ALL_ASSETS;
    const liveQuotes = await getLiveQuotes(req.user!.id, source);
    const coins = source.map((coin) => {
      const live = liveQuotes.get(coin.symbol);
      return {
        symbol: coin.symbol,
        name: coin.name,
        price: live?.price ?? getLivePrice(coin.symbol, coin.basePrice),
        change24h: live?.change24h ?? get24hChange(coin.symbol),
        marketCap: coin.marketCap,
        volume: live?.volume ?? coin.volume,
        logoUrl: coin.logoUrl,
        assetType: coin.assetType,
        source: live?.source ?? "simulated",
      };
    });
    res.json(coins);
  } catch (error) {
    req.log.error({ error }, "Failed to load live broker quotes");
    res.status(502).json({ error: "Unable to load live broker market data" });
  }
});

router.get("/coins/:symbol", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const coin = getCoinBySymbol(req.params.symbol);
  if (!coin) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  const live = (await getLiveQuotes(req.user!.id, [coin])).get(coin.symbol);
  const price = live?.price ?? getLivePrice(coin.symbol, coin.basePrice);
  const change24h = live?.change24h ?? get24hChange(coin.symbol);
  const route = await resolveConnectedBrokerRoute(
    req.user!.id,
    coin.symbol,
    coin.assetType,
  );
  const bars = route
    ? await route.adapter.getMarketBars(
        route.connection.creds,
        route.brokerSymbol,
        "1h",
        50,
      )
    : null;
  const priceHistory = bars?.map((bar) => ({
    timestamp: bar.time,
    price: bar.close,
  })) ?? [{ timestamp: new Date().toISOString(), price }];
  const prices = priceHistory.map((point) => point.price);
  res.json({
    symbol: coin.symbol,
    name: coin.name,
    price,
    change24h,
    marketCap: coin.marketCap,
    volume: coin.volume,
    logoUrl: coin.logoUrl,
    high24h: Math.max(...prices),
    low24h: Math.min(...prices),
    description: coin.description,
    priceHistory,
    assetType: coin.assetType,
    source: live?.source ?? "simulated",
  });
});

export default router;
