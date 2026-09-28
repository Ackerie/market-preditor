import { Router } from "express";
import { db, watchlistTable } from "@workspace/db";
import { AddToWatchlistBody } from "@workspace/api-zod";
import { getLivePrice, get24hChange, getCoinBySymbol } from "../lib/coins";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/watchlist", async (_req, res) => {
  try {
    const items = await db.select().from(watchlistTable);
    res.json(
      items.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        price: getLivePrice(item.symbol, 100),
        change24h: get24hChange(item.symbol),
        logoUrl: item.logoUrl,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to get watchlist" });
  }
});

router.post("/watchlist", async (req, res) => {
  const parsed = AddToWatchlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { symbol } = parsed.data;
  const coin = getCoinBySymbol(symbol);
  if (!coin) {
    res.status(400).json({ error: "Unknown coin symbol" });
    return;
  }

  try {
    const [item] = await db
      .insert(watchlistTable)
      .values({ symbol: coin.symbol, name: coin.name, logoUrl: coin.logoUrl })
      .onConflictDoNothing()
      .returning();

    if (!item) {
      const existing = await db.select().from(watchlistTable).where(eq(watchlistTable.symbol, symbol)).limit(1);
      const e = existing[0];
      res.status(201).json({
        id: e.id,
        symbol: e.symbol,
        name: e.name,
        price: getLivePrice(e.symbol, 100),
        change24h: get24hChange(e.symbol),
        logoUrl: e.logoUrl,
      });
      return;
    }

    res.status(201).json({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      price: getLivePrice(item.symbol, coin.basePrice),
      change24h: get24hChange(item.symbol),
      logoUrl: item.logoUrl,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add to watchlist" });
  }
});

router.delete("/watchlist/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    await db.delete(watchlistTable).where(eq(watchlistTable.symbol, symbol));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to remove from watchlist" });
  }
});

export default router;
