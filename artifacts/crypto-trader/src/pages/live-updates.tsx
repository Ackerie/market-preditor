import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCoins,
  useGetCoin,
  getListCoinsQueryKey,
  getGetCoinQueryKey,
} from "@workspace/api-client-react";
import { InteractiveMarketChart } from "@/components/interactive-market-chart";
import { formatCurrency, formatPercent, CoinIcon } from "@/components/shared";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  Crosshair,
  Layers3,
  Maximize2,
  Plus,
  Radio,
  Search,
  X,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

type FlashDir = "up" | "down" | null;
interface PriceEvent {
  id: number;
  symbol: string;
  name: string;
  logoUrl?: string;
  price: number;
  pct: number;
  dir: "up" | "down";
  at: Date;
}
let eventCounter = 0;

function shortVolume(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function LiveUpdates() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState("All markets");
  const [isPaused, setIsPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [chartMode, setChartMode] = useState<"candles" | "line">("candles");
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showIndicators, setShowIndicators] = useState(false);
  const [showLevels, setShowLevels] = useState(true);
  const [flashes, setFlashes] = useState<Record<string, FlashDir>>({});
  const [events, setEvents] = useState<PriceEvent[]>([]);
  const prevPrices = useRef<Record<string, number>>({});
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const queryClient = useQueryClient();
  const { data: coins } = useListCoins(undefined, {
    query: {
      queryKey: getListCoinsQueryKey(),
      refetchInterval: isPaused ? false : 2000,
    },
  });
  const selectedCoin =
    coins?.find((coin) => coin.symbol === selectedSymbol) ?? coins?.[0];
  const activeSymbol = selectedCoin?.symbol ?? "";
  const { data: coinDetail } = useGetCoin(activeSymbol, {
    query: {
      enabled: !!activeSymbol,
      queryKey: getGetCoinQueryKey(activeSymbol),
      refetchInterval: isPaused ? false : 5000,
    },
  });

  useEffect(() => {
    if (selectedCoin && !selectedSymbol) setSelectedSymbol(selectedCoin.symbol);
  }, [selectedCoin, selectedSymbol]);
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(
      () => queryClient.invalidateQueries({ queryKey: getListCoinsQueryKey() }),
      2000,
    );
    return () => clearInterval(id);
  }, [isPaused, queryClient]);

  const handleFlash = useCallback((symbol: string, dir: FlashDir) => {
    if (flashTimers.current[symbol]) clearTimeout(flashTimers.current[symbol]);
    setFlashes((previous) => ({ ...previous, [symbol]: dir }));
    flashTimers.current[symbol] = setTimeout(
      () => setFlashes((previous) => ({ ...previous, [symbol]: null })),
      900,
    );
  }, []);

  useEffect(() => {
    const handleFullscreen = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    if (!coins?.length) return;
    const newEvents: PriceEvent[] = [];
    coins.forEach((coin) => {
      const previous = prevPrices.current[coin.symbol];
      if (
        previous !== undefined &&
        Math.abs(coin.price - previous) > 0.000001
      ) {
        const dir = coin.price > previous ? "up" : "down";
        const pct = ((coin.price - previous) / previous) * 100;
        handleFlash(coin.symbol, dir);
        if (Math.abs(pct) > 0.001)
          newEvents.push({
            id: ++eventCounter,
            symbol: coin.symbol,
            name: coin.name,
            logoUrl: coin.logoUrl,
            price: coin.price,
            pct,
            dir,
            at: new Date(),
          });
      }
      prevPrices.current[coin.symbol] = coin.price;
    });
    if (newEvents.length) {
      setEvents((previous) => [...newEvents, ...previous].slice(0, 30));
      if (
        notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const event = newEvents[0];
        new Notification(`${event.symbol} price move`, {
          body: `${event.name} moved ${event.dir === "up" ? "up" : "down"} ${Math.abs(event.pct).toFixed(3)}%.`,
        });
      }
    }
  }, [coins, handleFlash, notificationsEnabled]);

  const visibleCoins = (coins ?? []).filter((coin) => {
    const matchesMarket =
      market === "All markets" ||
      coin.assetType === market.toLowerCase().replace(" ", "");
    const query = search.toLowerCase();
    return (
      matchesMarket &&
      (!query ||
        coin.symbol.toLowerCase().includes(query) ||
        coin.name.toLowerCase().includes(query))
    );
  });
  const movers = [...(coins ?? [])]
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 7);
  const isUp = (selectedCoin?.change24h ?? 0) >= 0;

  return (
    <div
      ref={containerRef}
      className="space-y-3 bg-background pb-16 text-[13px]"
    >
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-foreground">
            <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
            <span className="font-semibold tracking-tight">Markets</span>
            <span className="text-[11px] text-emerald-400">LIVE</span>
          </div>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <span className="hidden text-xs text-muted-foreground sm:block">
            Streaming prices · 2s refresh
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <IconButton
            label={notificationsEnabled ? "Disable alerts" : "Enable alerts"}
            onClick={async () => {
              if (!("Notification" in window)) return;
              const permission = await Notification.requestPermission();
              setNotificationsEnabled(permission === "granted");
            }}
          >
            <Bell className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={async () => {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await containerRef.current?.requestFullscreen();
            }}
          >
            <Maximize2 className="h-4 w-4" />
          </IconButton>
        </div>
        {settingsOpen && (
          <div className="absolute right-4 top-14 z-20 w-56 rounded-md border border-border bg-card p-3 shadow-xl">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span>Pause live updates</span>
              <input
                type="checkbox"
                checked={isPaused}
                onChange={(event) => setIsPaused(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              Price refreshes every 2 seconds when updates are active.
            </p>
          </div>
        )}
      </div>
      <div className="flex gap-1 overflow-hidden border-y border-border bg-card/60 py-2">
        {movers.map((coin) => (
          <button
            key={coin.symbol}
            onClick={() => setSelectedSymbol(coin.symbol)}
            className="flex min-w-33 items-center gap-2 border-r border-border px-3 text-left transition-colors hover:bg-muted/60"
          >
            <CoinIcon
              symbol={coin.symbol}
              logoUrl={coin.logoUrl}
              className="h-5 w-5"
            />
            <span className="font-semibold">{coin.symbol}</span>
            <span
              className={`font-mono text-xs ${coin.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {coin.change24h >= 0 ? "+" : ""}
              {coin.change24h.toFixed(2)}%
            </span>
          </button>
        ))}
      </div>

      <div className="grid min-h-170 grid-cols-1 overflow-hidden border border-border bg-card/30 lg:grid-cols-[220px_minmax(0,1fr)_250px]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Watchlist
            </span>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setMarket("All markets");
              }}
              aria-label="Reset watchlist filters"
              title="Reset watchlist filters"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1.5 text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <input
                aria-label="Search watchlist symbols"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search symbol"
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear watchlist search"
                  title="Clear watchlist search"
                  className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1 overflow-x-auto">
              {[
                "All markets",
                "Crypto",
                "Stock",
                "Forex",
                "Futures",
                "Commodity",
              ].map((item) => (
                <button
                  key={item}
                  onClick={() => setMarket(item)}
                  className={`whitespace-nowrap px-2 py-1 text-[10px] ${market === item ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-130 overflow-y-auto py-1">
            {visibleCoins.map((coin) => {
              const active = coin.symbol === activeSymbol;
              const flash = flashes[coin.symbol];
              return (
                <button
                  key={coin.symbol}
                  onClick={() => setSelectedSymbol(coin.symbol)}
                  className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50"}`}
                >
                  <CoinIcon
                    symbol={coin.symbol}
                    logoUrl={coin.logoUrl}
                    className="h-5 w-5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {coin.symbol}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {coin.name}
                    </span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`block font-mono text-xs transition-colors ${flash === "up" ? "text-emerald-300" : flash === "down" ? "text-red-300" : "text-foreground"}`}
                    >
                      {formatCurrency(coin.price)}
                    </span>
                    <span
                      className={`block font-mono text-[10px] ${coin.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {coin.change24h >= 0 ? "+" : ""}
                      {coin.change24h.toFixed(2)}%
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          {selectedCoin ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4">
                <div className="flex items-center gap-3">
                  <CoinIcon
                    symbol={selectedCoin.symbol}
                    logoUrl={selectedCoin.logoUrl}
                    className="h-9 w-9"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold">
                        {selectedCoin.symbol}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {selectedCoin.name}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedCoin.assetType} · realtime market
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-semibold tracking-tight">
                    {formatCurrency(selectedCoin.price)}
                  </div>
                  <div
                    className={`font-mono text-xs ${isUp ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {isUp ? "+" : ""}
                    {formatPercent(selectedCoin.change24h)} today
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y border-b border-border sm:grid-cols-4 sm:divide-y-0">
                <Metric
                  label="24h high"
                  value={formatCurrency(
                    coinDetail?.high24h ?? selectedCoin.price,
                  )}
                  tone="up"
                />
                <Metric
                  label="24h low"
                  value={formatCurrency(
                    coinDetail?.low24h ?? selectedCoin.price,
                  )}
                  tone="down"
                />
                <Metric
                  label="Volume"
                  value={shortVolume(selectedCoin.volume)}
                />
                <Metric
                  label="Market cap"
                  value={shortVolume(selectedCoin.marketCap)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex items-center gap-1">
                  <ChartTool
                    active={chartMode === "candles"}
                    label="Candlestick chart"
                    onClick={() => setChartMode("candles")}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                  </ChartTool>
                  <ChartTool
                    active={showCrosshair}
                    label="Toggle crosshair"
                    onClick={() => setShowCrosshair((visible) => !visible)}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </ChartTool>
                  <ChartTool
                    active={showIndicators}
                    label="Toggle chart indicators"
                    onClick={() => setShowIndicators((visible) => !visible)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </ChartTool>
                  <span className="mx-2 h-4 w-px bg-border" />
                  <ChartTool
                    active={showLevels}
                    label="Toggle price levels"
                    onClick={() => setShowLevels((visible) => !visible)}
                  >
                    <Layers3 className="h-3.5 w-3.5" />
                  </ChartTool>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setChartMode((mode) =>
                        mode === "candles" ? "line" : "candles",
                      )
                    }
                    className="text-[10px] text-primary hover:underline"
                    aria-label="Toggle chart style"
                  >
                    {chartMode === "candles" ? "candles" : "line"}
                  </button>
                  <span className="mx-1 h-3 w-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">
                    OHLC · live
                  </span>
                </div>
              </div>
              <div className="w-full px-1 pt-2">
                <InteractiveMarketChart
                  symbol={activeSymbol}
                  height={390}
                  compact
                  chartMode={chartMode}
                  showCrosshair={showCrosshair}
                  showIndicators={showIndicators}
                  showLevels={showLevels}
                />
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
                <span>Hover candles for OHLC and volume</span>
                <span>Refreshing every 5s</span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Waiting for market data...
            </div>
          )}
        </section>

        <aside className="min-w-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Market activity
            </span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="grid grid-cols-3 border-b border-border">
            <MarketCount
              label="Gainers"
              value={(coins ?? []).filter((coin) => coin.change24h > 0).length}
              tone="up"
            />
            <MarketCount
              label="Losers"
              value={(coins ?? []).filter((coin) => coin.change24h < 0).length}
              tone="down"
            />
            <MarketCount
              label="Flat"
              value={
                (coins ?? []).filter((coin) => coin.change24h === 0).length
              }
            />
          </div>
          <div className="max-h-133.75 overflow-y-auto p-2">
            {events.length ? (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 border-b border-border/70 px-2 py-2.5 last:border-0"
                >
                  <CoinIcon
                    symbol={event.symbol}
                    logoUrl={event.logoUrl}
                    className="h-5 w-5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{event.symbol}</span>
                      <span
                        className={`font-mono text-xs ${event.dir === "up" ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {event.dir === "up" ? "▲" : "▼"}{" "}
                        {Math.abs(event.pct).toFixed(3)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate">{event.name}</span>
                      <span>{event.at.toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-12 text-center text-xs text-muted-foreground">
                <Activity className="mx-auto mb-3 h-7 w-7 opacity-30" />
                Waiting for price movements
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      onClick={onClick}
      className="p-2 hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
function ChartTool({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`p-1.5 ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 font-mono text-xs font-semibold ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
function MarketCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "up" | "down";
}) {
  return (
    <div className="px-2 py-2.5 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`font-mono text-sm font-semibold ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
