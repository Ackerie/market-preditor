import { Router } from "express";
import {
  ALL_ASSETS,
  get24hChange,
  getCoinBySymbol,
  getLivePrice,
  refreshPublicQuote,
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
  const resultsByBroker = await Promise.all(
    listBrokers().map(async (broker) => {
      const connection = await broker.getConnection(userId);
      if (!connection) return [];
      const supportedAssets = assets.filter((asset) =>
        broker.routeSymbol(asset.symbol, asset.assetType),
      );
      if (!supportedAssets.length) return [];
      return broker.getMarketQuotes(connection.creds, supportedAssets);
    }),
  );
  resultsByBroker.forEach((results) => {
    results.forEach((quote) => {
      if (!quotes.has(quote.symbol)) quotes.set(quote.symbol, quote);
    });
  });
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
    const coins = await Promise.all(
      source.map(async (coin) => {
        const live = liveQuotes.get(coin.symbol);
        const publicQuote = live
          ? null
          : await refreshPublicQuote(coin.symbol, coin.basePrice, coin.assetType);
        return {
          symbol: coin.symbol,
          name: coin.name,
          price:
            live?.price ??
            publicQuote?.price ??
            getLivePrice(coin.symbol, coin.basePrice, coin.assetType),
          change24h:
            live?.change24h ??
            publicQuote?.change24h ??
            get24hChange(coin.symbol, coin.assetType),
          marketCap: coin.marketCap,
          volume: live?.volume ?? 0,
          logoUrl: coin.logoUrl,
          assetType: coin.assetType,
          source: live?.source ?? publicQuote?.source ?? "simulated",
        };
      }),
    );
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
  const publicQuote = live
    ? null
    : await refreshPublicQuote(coin.symbol, coin.basePrice, coin.assetType);
  const price =
    live?.price ?? publicQuote?.price ?? getLivePrice(coin.symbol, coin.basePrice, coin.assetType);
  const change24h =
    live?.change24h ?? publicQuote?.change24h ?? get24hChange(coin.symbol, coin.assetType);
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
        26,
      )
    : null;
  const priceHistory = bars?.map((bar) => ({
    timestamp: bar.time,
    price: bar.close,
  })) ?? [{ timestamp: new Date().toISOString(), price }];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const last24Hours = (bars ?? []).filter((bar) => {
    const timestamp = Date.parse(bar.time);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
  res.json({
    symbol: coin.symbol,
    name: coin.name,
    price,
    change24h,
    marketCap: coin.marketCap,
    volume: live?.volume ?? 0,
    logoUrl: coin.logoUrl,
    high24h:
      last24Hours.length > 0
        ? Math.max(...last24Hours.map((bar) => bar.high))
        : null,
    low24h:
      last24Hours.length > 0
        ? Math.min(...last24Hours.map((bar) => bar.low))
        : null,
    description: coin.description,
    priceHistory,
    assetType: coin.assetType,
    source: live?.source ?? publicQuote?.source ?? "simulated",
  });
});

export default router;
