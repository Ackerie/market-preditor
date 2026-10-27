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
  isPaused?: boolean;
  chartMode?: "candles" | "line";
  showCrosshair?: boolean;
  showIndicators?: boolean;
  showLevels?: boolean;
}

interface ChartCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

const TIMEFRAMES: Array<{
  value: MarketChartTimeframe;
  label: string;
  durationMs: number;
  visibleCount: number;
}> = [
  { value: "5m", label: "5m", durationMs: 5 * 60 * 1000, visibleCount: 48 },
  {
    value: "15m",
    label: "15m",
    durationMs: 15 * 60 * 1000,
    visibleCount: 96,
  },
  { value: "1h", label: "1h", durationMs: 60 * 60 * 1000, visibleCount: 40 },
];

function aggregateCandles(
  candles: ChartCandle[],
  durationMs: number,
): ChartCandle[] {
  const groups = new Map<number, ChartCandle[]>();
  for (const candle of candles) {
    const timestamp = Date.parse(candle.timestamp);
    if (!Number.isFinite(timestamp)) continue;
    const bucket = Math.floor(timestamp / durationMs) * durationMs;
    const group = groups.get(bucket) ?? [];
    group.push(candle);
    groups.set(bucket, group);
  }

  return [...groups.entries()]
    .sort(([first], [second]) => first - second)
    .map(([bucket, group]) => {
      const sorted = group.sort(
        (first, second) =>
          Date.parse(first.timestamp) - Date.parse(second.timestamp),
      );
      const first = sorted[0];
      const last = sorted.at(-1)!;
      const volumes = sorted.map((candle) => candle.volume);
      const hasVolume = volumes.every(
        (volume): volume is number => volume !== null,
      );
      return {
        timestamp: new Date(bucket).toISOString(),
        open: first.open,
        high: Math.max(...sorted.map((candle) => candle.high)),
        low: Math.min(...sorted.map((candle) => candle.low)),
        close: last.close,
        volume: hasVolume
          ? volumes.reduce((sum, volume) => sum + volume, 0)
          : null,
      };
    });
}

function formatPrice(value: number): string {
  return value < 1
    ? value.toFixed(5)
    : value < 10
      ? value.toFixed(4)
      : value.toFixed(2);
}

export function InteractiveMarketChart({
  symbol,
  height = 360,
  compact = false,
  isPaused = false,
  chartMode = "candles",
  showCrosshair = true,
  showIndicators = false,
  showLevels = true,
}: InteractiveMarketChartProps) {
  const [timeframe, setTimeframe] = useState<MarketChartTimeframe>("5m");
  const { data, isLoading, isError } = useGetAutoTradeCandles(symbol, {
    query: {
      queryKey: getGetAutoTradeCandlesQueryKey(symbol),
      refetchInterval: isPaused ? false : 5000,
      staleTime: 3000,
    },
  });

  const candles = useMemo(() => {
    if (!data?.candles?.length) return [];
    const normalized = data.candles
      .filter((candle) => {
        const values = [candle.open, candle.high, candle.low, candle.close];
        const volume = candle.volume;
        return (
          Number.isFinite(Date.parse(candle.time)) &&
          values.every((value) => Number.isFinite(value) && value > 0) &&
          candle.high >= Math.max(candle.open, candle.close) &&
          candle.low <= Math.min(candle.open, candle.close) &&
          candle.high >= candle.low &&
          (volume === undefined ||
            (Number.isFinite(volume) && volume >= 0))
        );
      })
      .map((candle) => ({
        timestamp: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? null,
      }))
      .sort(
        (first, second) =>
          Date.parse(first.timestamp) - Date.parse(second.timestamp),
      );
    const selected =
      TIMEFRAMES.find((item) => item.value === timeframe) ?? TIMEFRAMES[0];
    return aggregateCandles(normalized, selected.durationMs).slice(
      -selected.visibleCount,
    );
  }, [data, timeframe]);

  const windowHigh = candles.length
    ? Math.max(...candles.map((candle) => candle.high))
    : 0;
  const windowLow = candles.length
    ? Math.min(...candles.map((candle) => candle.low))
    : 0;
  const latest = candles.at(-1);
  const sourceLabel =
    data?.source === "simulated"
      ? "SIMULATED · NOT LIVE"
      : data?.source
        ? `BROKER DATA · ${data.source}`
        : "SOURCE UNKNOWN";

  if (isLoading && !data) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Loading market candles...
      </div>
    );
  }
  if (isError || !latest) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Market candles unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Chart timeframe"
        >
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
          <span className="text-emerald-400">Window H {formatPrice(windowHigh)}</span>
          <span className="text-red-400">Window L {formatPrice(windowLow)}</span>
          <span>{sourceLabel}</span>
          {latest && (
            <span>
              LAST CANDLE {new Date(latest.timestamp).toLocaleString()} (local)
            </span>
          )}
        </div>
      </div>
      <CandlestickChart
        candles={candles}
        timeframe={timeframe}
        volumeLabel={data?.volumeType === "ticks" ? "Tick volume" : "Volume"}
        height={height}
        levels={[
          { label: "HIGH", price: windowHigh, color: "#22c55e" },
          { label: "LOW", price: windowLow, color: "#ef4444" },
        ]}
        chartMode={chartMode}
        showCrosshair={showCrosshair}
        showIndicators={showIndicators}
        showLevels={showLevels}
      />
      {!compact && (
        <div className="grid grid-cols-3 gap-2 border-t border-border px-3 pt-2 text-[10px] font-mono">
          <div>
            <span className="text-muted-foreground">Open</span>
            <div>{formatPrice(latest.open)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Last close</span>
            <div>{formatPrice(latest.close)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Last candle range</span>
            <div>
              {formatPrice(latest.low)} - {formatPrice(latest.high)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
