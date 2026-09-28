import { Router } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getLivePrice, get24hChange, getCoinBySymbol } from "../lib/coins";

const router = Router();

router.get("/predictions/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const coin = getCoinBySymbol(symbol);
  if (!coin) {
    res.status(404).json({ error: "Coin not found" });
    return;
  }

  const currentPrice = getLivePrice(symbol, coin.basePrice);
  const change24h = get24hChange(symbol);

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `You are a crypto market analyst AI. Analyze ${coin.name} (${symbol}) and provide a trading prediction.

Current data:
- Current Price: $${currentPrice.toFixed(2)}
- 24h Change: ${change24h.toFixed(2)}%
- Market Cap: $${(coin.marketCap / 1e9).toFixed(2)}B
- 24h Volume: $${(coin.volume / 1e9).toFixed(2)}B

Provide a JSON response with exactly these fields:
{
  "signal": one of "strong_buy", "buy", "hold", "sell", "strong_sell",
  "confidence": a number from 0 to 100 representing confidence percentage,
  "reasoning": a 2-3 sentence explanation of your prediction,
  "targetPrice": a realistic price target within 7 days,
  "targetDate": a date string 7 days from today in ISO format
}

Only respond with valid JSON, no other text.`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const cleaned = content.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);

    res.json({
      symbol,
      signal: parsed.signal,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      targetPrice: parsed.targetPrice,
      targetDate: parsed.targetDate || targetDate.toISOString(),
      currentPrice,
    });
  } catch (err) {
    req.log?.error({ err }, "AI prediction failed");
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    res.json({
      symbol,
      signal: "hold" as const,
      confidence: 50,
      reasoning: `${coin.name} is showing mixed signals. With a 24h change of ${change24h.toFixed(2)}%, market conditions remain uncertain. Monitor closely before making a trade decision.`,
      targetPrice: currentPrice * 1.02,
      targetDate: targetDate.toISOString(),
      currentPrice,
    });
  }
});

export default router;
