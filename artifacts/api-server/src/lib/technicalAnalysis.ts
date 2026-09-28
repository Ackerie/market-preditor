import type { Candle } from "./coins";

export interface TechnicalAnalysis {
  currentPrice: number;
  sma20: number;
  sma50: number;
  rsi14: number;
  atr14: number;
  volatilityPct: number;
  momentum5Pct: number;
  momentum20Pct: number;
  support: number;
  resistance: number;
  regime: "bullish_trend" | "bearish_trend" | "range" | "volatile";
  suggestedStopLossPct: number;
  suggestedTakeProfitPct: number;
  riskReward: number;
  riskFlags: string[];
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function percentChange(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function analyzeCandles(candles: Candle[], currentPrice: number): TechnicalAnalysis {
  const valid = candles.filter(
    (candle) =>
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close) &&
      candle.high >= candle.low &&
      candle.close > 0,
  );
  const closes = valid.map((candle) => candle.close);
  const recent = closes.slice(-20);
  const latest = currentPrice > 0 ? currentPrice : closes.at(-1) ?? 0;
  const sma20 = average(recent);
  const sma50 = average(closes.slice(-50));
  const trueRanges = valid.slice(1).map((candle, index) => {
    const previousClose = valid[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  const atr14 = average(trueRanges.slice(-14));
  const volatilityPct = latest > 0 ? (atr14 / latest) * 100 : 0;

  const changes = valid.slice(1).map((candle, index) => candle.close - valid[index].close);
  const gains = changes.slice(-14).map((change) => Math.max(change, 0));
  const losses = changes.slice(-14).map((change) => Math.max(-change, 0));
  const averageGain = average(gains);
  const averageLoss = average(losses);
  const relativeStrength = averageLoss === 0 ? (averageGain > 0 ? Infinity : 1) : averageGain / averageLoss;
  const rsi14 = round(100 - 100 / (1 + relativeStrength));

  const support = Math.min(...valid.slice(-20).map((candle) => candle.low), latest);
  const resistance = Math.max(...valid.slice(-20).map((candle) => candle.high), latest);
  const momentum5Pct = percentChange(closes.at(-6) ?? latest, latest);
  const momentum20Pct = percentChange(closes.at(-21) ?? latest, latest);
  const trendSpreadPct = latest > 0 ? ((sma20 - sma50) / latest) * 100 : 0;

  const riskFlags: string[] = [];
  if (volatilityPct >= 3) riskFlags.push("high_volatility");
  if (rsi14 >= 72) riskFlags.push("overbought");
  if (rsi14 <= 28) riskFlags.push("oversold");
  if (latest > 0 && resistance > support && (latest - support) / (resistance - support) < 0.08) {
    riskFlags.push("near_support");
  }
  if (latest > 0 && resistance > support && (resistance - latest) / (resistance - support) < 0.08) {
    riskFlags.push("near_resistance");
  }

  const regime =
    volatilityPct >= 3
      ? "volatile"
      : trendSpreadPct >= 0.8 && momentum20Pct > 0
        ? "bullish_trend"
        : trendSpreadPct <= -0.8 && momentum20Pct < 0
          ? "bearish_trend"
          : "range";
  const suggestedStopLossPct = round(Math.max(volatilityPct * 1.8, 1.5));
  const suggestedTakeProfitPct = round(suggestedStopLossPct * 2);

  return {
    currentPrice: round(latest, latest < 1 ? 6 : 2),
    sma20: round(sma20, latest < 1 ? 6 : 2),
    sma50: round(sma50, latest < 1 ? 6 : 2),
    rsi14,
    atr14: round(atr14, latest < 1 ? 6 : 2),
    volatilityPct: round(volatilityPct),
    momentum5Pct: round(momentum5Pct),
    momentum20Pct: round(momentum20Pct),
    support: round(support, latest < 1 ? 6 : 2),
    resistance: round(resistance, latest < 1 ? 6 : 2),
    regime,
    suggestedStopLossPct,
    suggestedTakeProfitPct,
    riskReward: 2,
    riskFlags,
  };
}

export function formatTechnicalAnalysis(analysis: TechnicalAnalysis): string {
  return `
## Deterministic technical analysis
- Regime: ${analysis.regime}
- SMA20 / SMA50: ${analysis.sma20} / ${analysis.sma50}
- RSI(14): ${analysis.rsi14}
- ATR(14): ${analysis.atr14} (${analysis.volatilityPct}% of price)
- Momentum: 5 periods ${analysis.momentum5Pct >= 0 ? "+" : ""}${analysis.momentum5Pct}%, 20 periods ${analysis.momentum20Pct >= 0 ? "+" : ""}${analysis.momentum20Pct}%
- Support / resistance: ${analysis.support} / ${analysis.resistance}
- Suggested risk plan: stop ${analysis.suggestedStopLossPct}%, target ${analysis.suggestedTakeProfitPct}%, minimum reward/risk ${analysis.riskReward.toFixed(2)}
- Risk flags: ${analysis.riskFlags.length > 0 ? analysis.riskFlags.join(", ") : "none"}`;
}