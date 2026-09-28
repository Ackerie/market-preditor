import { Router } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  getCandles,
  getLivePrice,
  get24hChange,
  getCoinBySymbol,
} from "../lib/coins";
import {
  analyzeCandles,
  formatTechnicalAnalysis,
} from "../lib/technicalAnalysis";

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
  const technicalAnalysis = analyzeCandles(
    getCandles(symbol, coin.basePrice),
    currentPrice,
  );

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `You are a disciplined crypto swing-trading analyst. Analyze ${coin.name} (${symbol}) and produce a risk-adjusted 7-day prediction.

Current data:
- Current Price: $${currentPrice.toFixed(2)}
- 24h Change: ${change24h.toFixed(2)}%
- Market Cap: $${(coin.marketCap / 1e9).toFixed(2)}B
- 24h Volume: $${(coin.volume / 1e9).toFixed(2)}B

${formatTechnicalAnalysis(technicalAnalysis)}

Decision rules:
- Use the deterministic indicators as hard evidence, not decoration.
- Buy only when trend and momentum agree, RSI is not severely overbought, and the expected upside to resistance supports at least 2:1 reward/risk.
- Sell only when the bearish thesis is supported by momentum/trend failure, or when price is extended and a reversal is probable.
- Do not chase a move near resistance. Do not buy a falling knife near support without reversal evidence.
- Prefer hold when indicators conflict, volatility is high, or the setup cannot justify a 2:1 reward/risk ratio.
- Confidence measures setup quality, not certainty. Be conservative and never invent news or data.

Provide a JSON response with exactly these fields:
{
  "signal": one of "strong_buy", "buy", "hold", "sell", "strong_sell",
  "confidence": a number from 0 to 100 representing confidence percentage,
  "reasoning": a 2-3 sentence explanation of your prediction,
  "targetPrice": a realistic price target within 7 days,
  "targetDate": a date string 7 days from today in ISO format
}

Only respond with valid JSON, no markdown or extra text.`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const cleaned = content.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned) as {
      signal?: unknown;
      confidence?: unknown;
      reasoning?: unknown;
      targetPrice?: unknown;
      targetDate?: unknown;
    };
    const validSignals = new Set([
      "strong_buy",
      "buy",
      "hold",
      "sell",
      "strong_sell",
    ]);
    const signal = validSignals.has(String(parsed.signal))
      ? String(parsed.signal)
      : "hold";
    const confidence = Number(parsed.confidence);
    const targetPrice = Number(parsed.targetPrice);
    if (
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 100 ||
      !Number.isFinite(targetPrice) ||
      targetPrice <= 0 ||
      typeof parsed.reasoning !== "string" ||
      parsed.reasoning.trim().length === 0
    ) {
      throw new Error("Anthropic returned an invalid prediction shape");
    }
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);

    res.json({
      symbol,
      signal,
      confidence,
      reasoning: parsed.reasoning,
      targetPrice,
      targetDate:
        typeof parsed.targetDate === "string" && parsed.targetDate
          ? parsed.targetDate
          : targetDate.toISOString(),
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
      reasoning: `${coin.name} is not producing a validated AI signal. Technical context is ${technicalAnalysis.regime} with RSI ${technicalAnalysis.rsi14}, momentum ${technicalAnalysis.momentum20Pct >= 0 ? "+" : ""}${technicalAnalysis.momentum20Pct.toFixed(2)}%, and ${technicalAnalysis.volatilityPct.toFixed(2)}% ATR volatility. Hold until the AI provider returns a valid, risk-adjusted analysis.`,
      targetPrice: currentPrice,
      targetDate: targetDate.toISOString(),
      currentPrice,
    });
  }
});

export default router;
