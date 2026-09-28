import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAutoTradeSettings,
  getGetAutoTradeSettingsQueryKey,
  useGetAutoTradePnl,
  getGetAutoTradePnlQueryKey,
  useGetAutoTradeCandles,
  getGetAutoTradeCandlesQueryKey,
  useListAutoTradeEvents,
  getListAutoTradeEventsQueryKey,
  getListAutoTradeLogQueryKey,
  getGetPortfolioQueryKey,
  getListTradesQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  CandlestickChart as CandlestickIcon,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { CandlestickChart } from "@/components/candlestick-chart";

function fmtPrice(n: number) {
  return n < 1 ? n.toFixed(5) : n < 10 ? n.toFixed(4) : n.toFixed(2);
}

export interface TradeMark {
  side: "buy" | "sell";
  createdAt: string;
  fillPrice: number | null;
  notionalUsd: number;
}

function CandleChart({
  symbol,
  trades = [],
  avgCostUsd,
  takeProfitPct,
  stopLossPct,
}: {
  symbol: string;
  trades?: TradeMark[];
  avgCostUsd?: number | null;
  takeProfitPct?: number | null;
  stopLossPct?: number | null;
}) {
  const { data } = useGetAutoTradeCandles(symbol, {
    query: {
      queryKey: getGetAutoTradeCandlesQueryKey(symbol),
      refetchInterval: 60000,
    },
  });
  if (!data)
    return (
      <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
        Loading candles…
      </div>
    );

  const intervalMs = (data.intervalMinutes ?? 5) * 60 * 1000;
  const candles = data.candles.map((c) => ({
    timestamp: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: 0,
  }));
  const markers = trades.flatMap((trade) => {
    const ts = Date.parse(trade.createdAt);
    const index = candles.findIndex((c, i) => {
      const next = candles[i + 1];
      const open = Date.parse(c.timestamp);
      const close = next ? Date.parse(next.timestamp) : open + intervalMs;
      return ts >= open && ts < close;
    });
    if (index < 0) return [];
    return [
      {
        index,
        price: trade.fillPrice ?? candles[index].close,
        side: trade.side,
      },
    ];
  });
  const levels =
    avgCostUsd && avgCostUsd > 0
      ? [
          { label: "ENTRY", price: avgCostUsd, color: "#38bdf8" },
          ...(stopLossPct && stopLossPct > 0
            ? [
                {
                  label: "STOP",
                  price: avgCostUsd * (1 - stopLossPct / 100),
                  color: "#ef4444",
                },
              ]
            : []),
          ...(takeProfitPct && takeProfitPct > 0
            ? [
                {
                  label: "TARGET",
                  price: avgCostUsd * (1 + takeProfitPct / 100),
                  color: "#22c55e",
                },
              ]
            : []),
        ]
      : [];
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const changePct = previous
    ? ((latest.close - previous.close) / previous.close) * 100
    : 0;

  return (
    <div className="space-y-2">
      <CandlestickChart
        candles={candles}
        timeframe={`${data.intervalMinutes ?? 5}m`}
        height={360}
        levels={levels}
        markers={markers}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
        <div>
          <span className="text-muted-foreground">Last</span>
          <div className="font-semibold">${fmtPrice(latest.close)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Change</span>
          <div
            className={
              changePct >= 0
                ? "text-emerald-500 font-semibold"
                : "text-red-500 font-semibold"
            }
          >
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">High / Low</span>
          <div>
            ${fmtPrice(latest.high)} / ${fmtPrice(latest.low)}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Window</span>
          <div>
            {data.candles.length} × {data.intervalMinutes ?? 5}m
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DayTradePanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useGetAutoTradeSettings();
  const { data: dayPnl } = useGetAutoTradePnl(
    { strategy: "daytrade" },
    {
      query: {
        queryKey: getGetAutoTradePnlQueryKey({ strategy: "daytrade" }),
        refetchInterval: 30000,
      },
    },
  );

  const [dayTradeEnabled, setDayTradeEnabled] = useState(false);
  const [dayTradeMaxUsd, setDayTradeMaxUsd] = useState("200");
  const [exitGuardsEnabled, setExitGuardsEnabled] = useState(false);
  const [takeProfitPct, setTakeProfitPct] = useState("5");
  const [stopLossPct, setStopLossPct] = useState("3");
  const [running, setRunning] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (settings && !initialized.current) {
      setDayTradeEnabled((settings as any).dayTradeEnabled ?? false);
      setDayTradeMaxUsd(String((settings as any).dayTradeMaxUsd ?? 200));
      setExitGuardsEnabled((settings as any).exitGuardsEnabled ?? false);
      if ((settings as any).takeProfitPct != null)
        setTakeProfitPct(String((settings as any).takeProfitPct));
      if ((settings as any).stopLossPct != null)
        setStopLossPct(String((settings as any).stopLossPct));
      initialized.current = true;
    }
  }, [settings]);

  const handleSave = () => {
    const maxUsd = Number(dayTradeMaxUsd);
    if (!Number.isFinite(maxUsd) || maxUsd < 1) {
      toast({
        variant: "destructive",
        title: "Invalid trade size",
        description: "Day-trade max size must be at least $1.",
      });
      return;
    }
    fetch("/api/auto-trade/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayTradeEnabled,
        dayTradeMaxUsd: maxUsd,
        exitGuardsEnabled,
        takeProfitPct:
          exitGuardsEnabled && Number(takeProfitPct) > 0
            ? Number(takeProfitPct)
            : null,
        stopLossPct:
          exitGuardsEnabled && Number(stopLossPct) > 0
            ? Number(stopLossPct)
            : null,
      }),
    })
      .then((resp) => {
        if (resp.status === 401) {
          toast({
            variant: "destructive",
            title: "Session expired",
            description: "Please sign in again to save your settings.",
          });
          return;
        }
        if (!resp.ok) throw new Error(`Save failed (${resp.status})`);
        toast({ title: "Day-trade settings saved" });
        queryClient.invalidateQueries({
          queryKey: getGetAutoTradeSettingsQueryKey(),
        });
      })
      .catch(() =>
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save day-trade settings.",
        }),
      );
  };

  const handleRunNow = async () => {
    if (running) return;
    setRunning(true);
    try {
      const statusResp = await fetch("/api/auto-trade/run-status");
      if (statusResp.ok && (await statusResp.json()).daytradeRunning) {
        toast({
          title: "Day-trade bot is already running",
          description:
            "A day-trade cycle is in progress. Wait for it to finish, then try again.",
        });
        return;
      }
      const resp = await fetch("/api/auto-trade/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: "daytrade" }),
      });
      if (resp.status === 401) {
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "Please sign in again, then start the run.",
        });
        return;
      }
      if (resp.status === 409) {
        toast({
          title: "Bot is already running",
          description: "Another trading cycle is in progress.",
        });
        return;
      }
      if (!resp.ok) throw new Error(`Run failed (${resp.status})`);
      const result = await resp.json();
      toast({
        title: `Day-trade run complete — ${result.tradesExecuted} trade${result.tradesExecuted !== 1 ? "s" : ""} executed`,
        description: `Evaluated ${result.entriesEvaluated} assets on intraday candles.`,
      });
      queryClient.invalidateQueries({
        queryKey: getGetAutoTradePnlQueryKey({ strategy: "daytrade" }),
      });
      queryClient.invalidateQueries({
        queryKey: getListAutoTradeLogQueryKey(),
      });
      queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetAutoTradeSettingsQueryKey(),
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Day-trade run failed",
        description: "Check the activity log — trades may still have executed.",
      });
    } finally {
      setRunning(false);
    }
  };

  const { data: events } = useListAutoTradeEvents({
    query: {
      queryKey: getListAutoTradeEventsQueryKey(),
      refetchInterval: 30000,
    },
  });

  const openPositions = (dayPnl?.positions ?? []).filter((p) => p.openQty > 0);

  // Executed day-trade fills, grouped per symbol, for the buy/sell chart markers.
  const dayTradesBySymbol = new Map<string, TradeMark[]>();
  for (const e of events ?? []) {
    if (e.strategy !== "daytrade" || e.outcome !== "executed") continue;
    const list = dayTradesBySymbol.get(e.symbol) ?? [];
    list.push({
      side: e.side,
      createdAt: e.createdAt,
      fillPrice: e.fillPrice ?? null,
      notionalUsd: e.notionalUsd,
    });
    dayTradesBySymbol.set(e.symbol, list);
  }
  const openSymbols = new Set(openPositions.map((p) => p.symbol));
  const tradedOnlySymbols = [...dayTradesBySymbol.keys()].filter(
    (s) => !openSymbols.has(s),
  );
  const formatSignedUsd = (n: number) =>
    `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CandlestickIcon className="w-4 h-4 text-muted-foreground" />
              Day-Trade Bot
              <Badge
                variant={dayTradeEnabled ? "default" : "secondary"}
                className={
                  dayTradeEnabled ? "bg-emerald-500 hover:bg-emerald-600" : ""
                }
              >
                {dayTradeEnabled ? "● ON" : "○ OFF"}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              A separate intraday bot: analyzes 5-minute candlestick charts
              continuously while the US market is open (every 15 minutes after
              the close), enters and exits within the day, and manages only its
              own positions. Runs independently of the long-term auto-trader.
            </CardDescription>
          </div>
          <Button
            onClick={handleRunNow}
            disabled={running}
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running ? "Running…" : "Run Day-Trade Now"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
            <div>
              <Label className="font-semibold">Day-Trading</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {dayTradeEnabled
                  ? "Runs continuously during market hours, every 15 min after close"
                  : "Paused"}
              </p>
            </div>
            <Switch
              checked={dayTradeEnabled}
              onCheckedChange={setDayTradeEnabled}
            />
          </div>
          <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-border">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Max Trade Size (USD)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                $
              </span>
              <Input
                type="number"
                className="pl-7 h-8"
                value={dayTradeMaxUsd}
                onChange={(e) => setDayTradeMaxUsd(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Exit guards (take-profit / stop-loss) — day-trade positions only */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Day-Trade Exits
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-sell day-trade positions at take-profit or stop-loss
                thresholds each cycle.
              </p>
            </div>
            <Switch
              checked={exitGuardsEnabled}
              onCheckedChange={setExitGuardsEnabled}
            />
          </div>
          {exitGuardsEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Take Profit (%)
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={takeProfitPct}
                    onChange={(e) => setTakeProfitPct(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">
                    %
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Stop Loss (%)
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={stopLossPct}
                    onChange={(e) => setStopLossPct(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">
                    %
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <Button className="w-full" onClick={handleSave}>
          Save Day-Trade Settings
        </Button>

        {/* Open day-trade positions with the candles the bot analyzes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Open Day-Trade Positions
            </Label>
            {dayPnl && dayPnl.totalRealizedPnlUsd != null && (
              <span
                className={`text-xs font-mono font-semibold flex items-center gap-1 ${dayPnl.totalRealizedPnlUsd >= 0 ? "text-emerald-500" : "text-red-500"}`}
              >
                {dayPnl.totalRealizedPnlUsd >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {formatSignedUsd(dayPnl.totalRealizedPnlUsd)} realized (
                {dayPnl.windowDays}d)
              </span>
            )}
          </div>
          {openPositions.length === 0 && tradedOnlySymbols.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No day-trade activity yet. When the day-trade bot buys or sells,
              each traded asset shows up here with the intraday candlestick
              chart the bot analyzes, with ▲ buy and ▼ sell markers on the
              candles.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {openPositions.map((p) => (
                <div
                  key={`${p.broker}-${p.symbol}`}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{p.symbol}</span>
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 h-4 uppercase"
                      >
                        {p.broker}
                      </Badge>
                      <Badge className="text-[10px] py-0 h-4 bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/15">
                        OPEN
                      </Badge>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {p.openQty.toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}
                      {p.avgCostUsd != null
                        ? ` @ $${fmtPrice(p.avgCostUsd)}`
                        : ""}
                    </span>
                  </div>
                  <CandleChart
                    symbol={p.symbol}
                    trades={dayTradesBySymbol.get(p.symbol) ?? []}
                    avgCostUsd={p.avgCostUsd}
                    takeProfitPct={
                      exitGuardsEnabled ? Number(takeProfitPct) : null
                    }
                    stopLossPct={exitGuardsEnabled ? Number(stopLossPct) : null}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    5-minute candles the day-trade AI reads each cycle · ▲ bot
                    buys · ▼ bot sells
                  </p>
                </div>
              ))}
              {tradedOnlySymbols.map((symbol) => {
                const marks = dayTradesBySymbol.get(symbol) ?? [];
                const buys = marks.filter((m) => m.side === "buy").length;
                const sells = marks.length - buys;
                return (
                  <div
                    key={symbol}
                    className="rounded-lg border border-border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{symbol}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 h-4 uppercase"
                        >
                          Traded
                        </Badge>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {buys > 0 ? `${buys} buy${buys !== 1 ? "s" : ""}` : ""}
                        {buys > 0 && sells > 0 ? " · " : ""}
                        {sells > 0
                          ? `${sells} sell${sells !== 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </div>
                    <CandleChart symbol={symbol} trades={marks} />
                    <p className="text-[10px] text-muted-foreground">
                      5-minute candles the day-trade AI reads each cycle · ▲ bot
                      buys · ▼ bot sells
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
