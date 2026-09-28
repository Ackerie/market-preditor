import { useMemo, useState } from "react";
import {
  getGetAutoTradeCandlesQueryKey,
  useGetAutoTradeCandles,
} from "@workspace/api-client-react";
import { CandlestickChart } from "@/components/candlestick-chart";

export type MarketChartTimeframe = "5m" | "15m" | "1h";

interface InteractiveMarketChartProps {
  symbol: string;
  height?: number;
  compact?: boolean;
}

interface ChartCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAMES: Array<{ value: MarketChartTimeframe; label: string; groupSize: number }> = [
  { value: "5m", label: "5m", groupSize: 1 },
  { value: "15m", label: "15m", groupSize: 3 },
  { value: "1h", label: "1h", groupSize: 12 },
];

function aggregateCandles(candles: ChartCandle[], groupSize: number): ChartCandle[] {
  if (groupSize === 1) return candles;
  const grouped: ChartCandle[] = [];
  for (let index = 0; index < candles.length; index += groupSize) {
    const group = candles.slice(index, index + groupSize);
    const first = group[0];
    const last = group.at(-1);
    if (!first || !last) continue;
    grouped.push({
      timestamp: first.timestamp,
      open: first.open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: last.close,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0),
    });
  }
  return grouped;
}

function formatPrice(value: number): string {
  return value < 1 ? value.toFixed(5) : value < 10 ? value.toFixed(4) : value.toFixed(2);
}

export function InteractiveMarketChart({
  symbol,
  height = 360,
  compact = false,
}: InteractiveMarketChartProps) {
  const [timeframe, setTimeframe] = useState<MarketChartTimeframe>("5m");
  const { data, isLoading, isError } = useGetAutoTradeCandles(symbol, {
    query: {
      queryKey: getGetAutoTradeCandlesQueryKey(symbol),
      refetchInterval: 5000,
      staleTime: 3000,
    },
  });

  const candles = useMemo(() => {
    if (!data?.candles?.length) return [];
    const normalized = data.candles.map((candle) => ({
      timestamp: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: "volume" in candle && typeof candle.volume === "number" ? candle.volume : 0,
    }));
    const selected = TIMEFRAMES.find((item) => item.value === timeframe) ?? TIMEFRAMES[0];
    return aggregateCandles(normalized, selected.groupSize);
  }, [data, timeframe]);

  const windowHigh = candles.length ? Math.max(...candles.map((candle) => candle.high)) : 0;
  const windowLow = candles.length ? Math.min(...candles.map((candle) => candle.low)) : 0;
  const latest = candles.at(-1);

  if (isLoading && !data) {
    return <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>Loading live candles...</div>;
  }
  if (isError || !latest) {
    return <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>Live chart unavailable.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
        <div className="flex items-center gap-1" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTimeframe(item.value)}
              className={`px-2 py-1 text-[11px] transition-colors ${
                timeframe === item.value
                  ? "bg-primary/15 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
          <span className="text-emerald-400">H {formatPrice(windowHigh)}</span>
          <span className="text-red-400">L {formatPrice(windowLow)}</span>
          <span>LIVE</span>
        </div>
      </div>
      <CandlestickChart
        candles={candles}
        timeframe={timeframe}
        height={height}
        levels={[
          { label: "HIGH", price: windowHigh, color: "#22c55e" },
          { label: "LOW", price: windowLow, color: "#ef4444" },
        ]}
      />
      {!compact && (
        <div className="grid grid-cols-3 gap-2 border-t border-border px-3 pt-2 text-[10px] font-mono">
          <div>
            <span className="text-muted-foreground">Open</span>
            <div>{formatPrice(latest.open)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Last</span>
            <div>{formatPrice(latest.close)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Range</span>
            <div>{formatPrice(latest.low)} - {formatPrice(latest.high)}</div>
          </div>
        </div>
      )}
    </div>
  );
}