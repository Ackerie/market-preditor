import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { formatCurrency } from "@/components/shared";

interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  candles: Candle[];
  timeframe?: string;
  height?: number;
  levels?: Array<{ label: string; price: number; color: string }>;
  markers?: Array<{ index: number; price: number; side: "buy" | "sell" }>;
}

const MARGIN = { top: 8, right: 76, bottom: 36, left: 0 };
const VOLUME_RATIO = 0.18;
const VOLUME_GAP = 8;

function formatAxisPrice(p: number): string {
  if (p >= 100000) return `$${(p / 1000).toFixed(0)}k`;
  if (p >= 10000)
    return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1000) return `$${p.toFixed(0)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

export function CandlestickChart({
  candles,
  timeframe = "5m",
  height = 420,
  levels = [],
  markers = [],
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (candles.length === 0) {
    return <div ref={containerRef} className="w-full" style={{ height }} />;
  }

  const chartW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const chartH = height - MARGIN.top - MARGIN.bottom;
  const volH = chartH * VOLUME_RATIO;
  const priceH = chartH - volH - VOLUME_GAP;

  const minLow = Math.min(...candles.map((c) => c.low));
  const maxHigh = Math.max(...candles.map((c) => c.high));
  const priceRange = maxHigh - minLow || maxHigh * 0.01;
  const pricePad = priceRange * 0.04;
  const yMin = minLow - pricePad;
  const yMax = maxHigh + pricePad;

  const maxVol = Math.max(1, ...candles.map((c) => c.volume));

  const priceToY = (p: number) =>
    priceH - ((p - yMin) / (yMax - yMin)) * priceH;
  const volToH = (v: number) => (v / maxVol) * volH;

  const n = candles.length;
  const slotW = chartW / n;
  const bodyW = Math.max(1.5, Math.min(14, slotW * 0.65));
  const candleX = (i: number) => slotW * i + slotW / 2;

  const numTicks = 6;
  const priceTicks: number[] = [];
  for (let i = 0; i <= numTicks; i++) {
    priceTicks.push(yMin + (yMax - yMin) * (i / numTicks));
  }

  const xTickInterval = Math.max(1, Math.floor(n / 8));
  const xTicks = candles
    .map((c, i) => ({ i, ts: c.timestamp }))
    .filter((_, i) => i % xTickInterval === 0);

  const hCandle = hovered !== null ? candles[hovered] : null;
  const hovX = hovered !== null ? candleX(hovered) : null;

  const tooltipLeft =
    hovX !== null && hovX + MARGIN.left > width * 0.55
      ? MARGIN.left + 8
      : hovX !== null
        ? hovX + MARGIN.left + 14
        : 0;

  return (
    <div
      ref={containerRef}
      className="w-full relative select-none"
      style={{ height }}
    >
      <svg width={width} height={height} onMouseLeave={() => setHovered(null)}>
        <defs>
          <clipPath id="candle-clip">
            <rect x={0} y={0} width={chartW} height={priceH} />
          </clipPath>
          <clipPath id="volume-clip">
            <rect x={0} y={0} width={chartW} height={volH} />
          </clipPath>
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Price grid lines */}
          {priceTicks.map((tick, i) => {
            const y = priceToY(tick);
            if (y < -1 || y > priceH + 1) return null;
            return (
              <line
                key={i}
                x1={0}
                x2={chartW}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeOpacity={0.4}
                strokeDasharray="3 4"
              />
            );
          })}

          {/* Candle bodies + wicks */}
          <g clipPath="url(#candle-clip)">
            {candles.map((c, i) => {
              const cx = candleX(i);
              const isUp = c.close >= c.open;
              const upColor = "#22c55e";
              const downColor = "#ef4444";
              const color = isUp ? upColor : downColor;
              const bodyTop = priceToY(Math.max(c.open, c.close));
              const bodyBot = priceToY(Math.min(c.open, c.close));
              const bodyH = Math.max(1, bodyBot - bodyTop);
              const wickTop = priceToY(c.high);
              const wickBot = priceToY(c.low);
              const isHov = hovered === i;
              const dimmed = hovered !== null && !isHov;
              return (
                <g key={i} opacity={dimmed ? 0.4 : 1}>
                  {/* High-to-low wick */}
                  <line
                    x1={cx}
                    x2={cx}
                    y1={wickTop}
                    y2={wickBot}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  {/* Open-to-close body */}
                  <rect
                    x={cx - bodyW / 2}
                    y={bodyTop}
                    width={bodyW}
                    height={bodyH}
                    fill={isUp ? color : color}
                    fillOpacity={isUp ? 0.8 : 0.95}
                    stroke={color}
                    strokeWidth={0.5}
                    rx={1}
                  />
                </g>
              );
            })}
          </g>

          {/* Hover price line */}
          {hovered !== null && hCandle && (
            <line
              x1={0}
              x2={chartW}
              y1={priceToY(hCandle.close)}
              y2={priceToY(hCandle.close)}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.5}
            />
          )}

          {/* Optional position levels and executed trade markers. */}
          {levels.map((level) => {
            if (level.price < yMin || level.price > yMax) return null;
            const y = priceToY(level.price);
            return (
              <g key={level.label} pointerEvents="none">
                <line
                  x1={0}
                  x2={chartW}
                  y1={y}
                  y2={y}
                  stroke={level.color}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
                <rect
                  x={chartW - 66}
                  y={y - 9}
                  width={64}
                  height={18}
                  rx={3}
                  fill={level.color}
                  fillOpacity={0.16}
                />
                <text
                  x={chartW - 6}
                  y={y + 3}
                  fill={level.color}
                  fontSize={9}
                  textAnchor="end"
                  fontFamily="ui-monospace, monospace"
                >
                  {level.label}
                </text>
              </g>
            );
          })}

          {markers.map((marker, index) => {
            const candle = candles[marker.index];
            if (!candle || marker.price < yMin || marker.price > yMax)
              return null;
            const cx = candleX(marker.index);
            const cy = priceToY(marker.price);
            const color = marker.side === "buy" ? "#22c55e" : "#ef4444";
            const points =
              marker.side === "buy"
                ? `${cx},${cy - 7} ${cx - 6},${cy + 4} ${cx + 6},${cy + 4}`
                : `${cx},${cy + 7} ${cx - 6},${cy - 4} ${cx + 6},${cy - 4}`;
            return (
              <polygon
                key={`${marker.side}-${marker.index}-${index}`}
                points={points}
                fill={color}
                stroke="var(--color-background)"
                strokeWidth={1}
              />
            );
          })}

          {/* Volume bars */}
          <g transform={`translate(0,${priceH + VOLUME_GAP})`}>
            <clipPath id="vol-clip-inner">
              <rect x={0} y={0} width={chartW} height={volH} />
            </clipPath>
            <g clipPath="url(#vol-clip-inner)">
              {candles.map((c, i) => {
                const cx = candleX(i);
                const isUp = c.close >= c.open;
                const vH = volToH(c.volume);
                const dimmed = hovered !== null && hovered !== i;
                return (
                  <rect
                    key={i}
                    x={cx - bodyW / 2}
                    y={volH - vH}
                    width={bodyW}
                    height={vH}
                    fill={isUp ? "#22c55e" : "#ef4444"}
                    fillOpacity={dimmed ? 0.15 : 0.35}
                    rx={1}
                  />
                );
              })}
            </g>
          </g>

          {/* Vertical crosshair */}
          {hovX !== null && (
            <line
              x1={hovX}
              x2={hovX}
              y1={0}
              y2={priceH + VOLUME_GAP + volH}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
            />
          )}

          {/* Hover candle highlight band */}
          {hovered !== null && (
            <rect
              x={candleX(hovered) - slotW / 2}
              y={0}
              width={slotW}
              height={priceH + VOLUME_GAP + volH}
              fill="var(--color-muted-foreground)"
              fillOpacity={0.06}
              pointerEvents="none"
            />
          )}

          {/* Y-axis price labels */}
          {priceTicks.map((tick, i) => {
            const y = priceToY(tick);
            if (y < -1 || y > priceH + 1) return null;
            return (
              <text
                key={i}
                x={chartW + 6}
                y={y + 4}
                fill="var(--color-muted-foreground)"
                fontSize={10}
                textAnchor="start"
                fontFamily="ui-monospace, monospace"
              >
                {formatAxisPrice(tick)}
              </text>
            );
          })}

          {/* X-axis time labels */}
          <g transform={`translate(0,${priceH + VOLUME_GAP + volH + 8})`}>
            {xTicks.map(({ i, ts }) => (
              <text
                key={i}
                x={candleX(i)}
                y={12}
                fill="var(--color-muted-foreground)"
                fontSize={10}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {format(new Date(ts), "HH:mm")}
              </text>
            ))}
          </g>

          {/* Invisible hover hit targets */}
          {candles.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={candleX(i) - slotW / 2}
              y={0}
              width={slotW}
              height={priceH + VOLUME_GAP + volH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
            />
          ))}
        </g>
      </svg>

      {/* Floating OHLCV tooltip */}
      {hCandle && (
        <div
          className="absolute top-2 pointer-events-none z-10 transition-all"
          style={{ left: tooltipLeft }}
        >
          <div className="bg-card border border-border rounded-lg shadow-xl p-2.5 text-xs min-w-[148px]">
            <p className="text-muted-foreground mb-1.5 text-[10px] font-medium">
              {format(new Date(hCandle.timestamp), "MMM d, yyyy  HH:mm")}
            </p>
            <div className="space-y-1 font-mono">
              <div className="flex justify-between gap-5">
                <span className="text-muted-foreground">O</span>
                <span className="font-medium">
                  {formatCurrency(hCandle.open)}
                </span>
              </div>
              <div className="flex justify-between gap-5">
                <span className="text-muted-foreground">H</span>
                <span className="font-medium text-emerald-500">
                  {formatCurrency(hCandle.high)}
                </span>
              </div>
              <div className="flex justify-between gap-5">
                <span className="text-muted-foreground">L</span>
                <span className="font-medium text-red-500">
                  {formatCurrency(hCandle.low)}
                </span>
              </div>
              <div className="flex justify-between gap-5">
                <span className="text-muted-foreground">C</span>
                <span
                  className={`font-medium ${
                    hCandle.close >= hCandle.open
                      ? "text-emerald-500"
                      : "text-red-500"
                  }`}
                >
                  {formatCurrency(hCandle.close)}
                </span>
              </div>
              <div className="flex justify-between gap-5 pt-1 mt-0.5 border-t border-border/60">
                <span className="text-muted-foreground">Vol</span>
                <span className="font-medium">
                  {hCandle.volume >= 1000
                    ? `${(hCandle.volume / 1000).toFixed(1)}K`
                    : hCandle.volume.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
