export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const timeframeMs: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

const candleCount: Record<string, number> = {
  "1m": 120,
  "5m": 100,
  "15m": 80,
  "1h": 60,
};

export function generateCandles(basePrice: number, timeframe: string): Candle[] {
  const intervalMs = timeframeMs[timeframe] ?? timeframeMs["5m"];
  const count = candleCount[timeframe] ?? 100;
  const candles: Candle[] = [];
  const now = Date.now();
  let price = basePrice * (0.92 + Math.random() * 0.16);

  for (let i = count - 1; i >= 0; i--) {
    const ts = new Date(now - i * intervalMs).toISOString();
    const volatility = basePrice * 0.008;
    const open = price;
    const close = price + (Math.random() - 0.48) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = basePrice * (500 + Math.random() * 1500);
    candles.push({ timestamp: ts, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

export function calcRSI(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  const closes = candles.map((c) => c.close);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values[0];
  for (const v of values) {
    prev = v * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function calcMACD(candles: Candle[]): { value: number; signal: number; histogram: number } {
  const closes = candles.map((c) => c.close);
  if (closes.length < 26) return { value: 0, signal: 0, histogram: 0 };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  const value = macdLine[last];
  const signal = signalLine[last];
  return { value, signal, histogram: value - signal };
}

export function calcBollingerBands(
  candles: Candle[],
  period = 20
): { upper: number; middle: number; lower: number; bandwidth: number } {
  const closes = candles.map((c) => c.close);
  if (closes.length < period) {
    const last = closes[closes.length - 1];
    return { upper: last * 1.02, middle: last, lower: last * 0.98, bandwidth: 4 };
  }
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const bandwidth = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
  return { upper, middle: mean, lower, bandwidth };
}

export function calcMA(candles: Candle[], period: number): number {
  const closes = candles.map((c) => c.close);
  if (closes.length < period) return closes[closes.length - 1];
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calcTrend(
  rsi: number,
  macd: { histogram: number },
  close: number,
  ma20: number,
  ma50: number
): "strong_bullish" | "bullish" | "neutral" | "bearish" | "strong_bearish" {
  let score = 0;
  if (rsi > 60) score += 2;
  else if (rsi > 50) score += 1;
  else if (rsi < 40) score -= 2;
  else if (rsi < 50) score -= 1;

  if (macd.histogram > 0) score += 1;
  else score -= 1;

  if (close > ma20) score += 1;
  else score -= 1;

  if (ma20 > ma50) score += 1;
  else score -= 1;

  if (score >= 4) return "strong_bullish";
  if (score >= 2) return "bullish";
  if (score >= -1) return "neutral";
  if (score >= -3) return "bearish";
  return "strong_bearish";
}
