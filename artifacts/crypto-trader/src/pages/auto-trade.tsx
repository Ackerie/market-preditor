import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAutoTradeSettings,
  useGetPortfolio,
  getGetAutoTradeSettingsQueryKey,
  useUpdateAutoTradeSettings,
  useListAutoTradeLog,
  getListAutoTradeLogQueryKey,
  getGetPortfolioQueryKey,
  getListTradesQueryKey,
  AutoTradeSettingsInputRiskLevel,
  useGetAutoTradePnl,
  getGetAutoTradePnlQueryKey,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  StopCircle,
  Check,
  Minus,
  Bot,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Activity,
  BarChart3,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Target,
  Server,
  Loader2,
  Repeat,
  CalendarClock,
  Timer,
  Bitcoin,
  Landmark,
  BarChart2,
  Zap,
  Gem,
} from "lucide-react";
import { format } from "date-fns";
import {
  AutoTradeAlertBanner,
  AutoTradeActivityFeed,
} from "@/components/auto-trade-alerts";

type AssetClass = "crypto" | "stock" | "forex" | "futures" | "commodity";
type RunMode = "interval" | "continuous" | "scheduled";

const ASSET_CLASS_META: Record<
  AssetClass,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    badgeClass: string;
    assets: Array<{ symbol: string; name: string }>;
  }
> = {
  crypto: {
    icon: Bitcoin,
    label: "Crypto",
    color: "text-orange-400",
    badgeClass: "border-orange-400/40 bg-orange-400/10 text-orange-400",
    assets: [
      { symbol: "BTC", name: "Bitcoin" },
      { symbol: "ETH", name: "Ethereum" },
      { symbol: "SOL", name: "Solana" },
      { symbol: "BNB", name: "BNB" },
      { symbol: "XRP", name: "XRP" },
      { symbol: "ADA", name: "Cardano" },
      { symbol: "AVAX", name: "Avalanche" },
      { symbol: "DOT", name: "Polkadot" },
      { symbol: "LINK", name: "Chainlink" },
      { symbol: "DOGE", name: "Dogecoin" },
    ],
  },
  stock: {
    icon: BarChart2,
    label: "Stocks",
    color: "text-blue-400",
    badgeClass: "border-blue-400/40 bg-blue-400/10 text-blue-400",
    assets: [
      { symbol: "AAPL", name: "Apple" },
      { symbol: "MSFT", name: "Microsoft" },
      { symbol: "NVDA", name: "NVIDIA" },
      { symbol: "GOOGL", name: "Alphabet" },
      { symbol: "AMZN", name: "Amazon" },
      { symbol: "META", name: "Meta" },
      { symbol: "TSLA", name: "Tesla" },
      { symbol: "NFLX", name: "Netflix" },
      { symbol: "AMD", name: "AMD" },
      { symbol: "JPM", name: "JPMorgan" },
    ],
  },
  forex: {
    icon: Landmark,
    label: "Forex",
    color: "text-emerald-400",
    badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
    assets: [
      { symbol: "EURUSD", name: "EUR/USD" },
      { symbol: "GBPUSD", name: "GBP/USD" },
      { symbol: "USDJPY", name: "USD/JPY" },
      { symbol: "AUDUSD", name: "AUD/USD" },
      { symbol: "USDCAD", name: "USD/CAD" },
      { symbol: "USDCHF", name: "USD/CHF" },
      { symbol: "NZDUSD", name: "NZD/USD" },
      { symbol: "XAUUSD", name: "Gold/USD" },
    ],
  },
  futures: {
    icon: Zap,
    label: "Futures",
    color: "text-purple-400",
    badgeClass: "border-purple-400/40 bg-purple-400/10 text-purple-400",
    assets: [
      { symbol: "BTC-PERP", name: "BTC Perp" },
      { symbol: "ETH-PERP", name: "ETH Perp" },
      { symbol: "SOL-PERP", name: "SOL Perp" },
      { symbol: "BNB-PERP", name: "BNB Perp" },
      { symbol: "XRP-PERP", name: "XRP Perp" },
      { symbol: "AVAX-PERP", name: "AVAX Perp" },
      { symbol: "DOGE-PERP", name: "DOGE Perp" },
      { symbol: "ES-FUT", name: "S&P 500" },
      { symbol: "NQ-FUT", name: "Nasdaq 100" },
      { symbol: "YM-FUT", name: "Dow Jones" },
      { symbol: "AAPL-FUT", name: "Apple Fut" },
      { symbol: "TSLA-FUT", name: "Tesla Fut" },
      { symbol: "NVDA-FUT", name: "NVIDIA Fut" },
    ],
  },
  commodity: {
    icon: Gem,
    label: "Commodities",
    color: "text-amber-400",
    badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-400",
    assets: [
      { symbol: "WTI", name: "Crude Oil (WTI)" },
      { symbol: "BRENT", name: "Brent Crude" },
      { symbol: "NATGAS", name: "Natural Gas" },
      { symbol: "SILVER", name: "Silver" },
      { symbol: "COPPER", name: "Copper" },
      { symbol: "PLATINUM", name: "Platinum" },
      { symbol: "WHEAT", name: "Wheat" },
      { symbol: "CORN", name: "Corn" },
    ],
  },
};

const COMMODITY_SYMBOLS = new Set([
  "WTI",
  "BRENT",
  "NATGAS",
  "SILVER",
  "COPPER",
  "PLATINUM",
  "WHEAT",
  "CORN",
]);

type ProgressEvent =
  | {
      type: "start";
      total: number;
      marketSentiment: string;
      bullishCount: number;
    }
  | {
      type: "analyzing";
      index: number;
      total: number;
      symbol: string;
      name: string;
      logoUrl: string;
      assetType?: AssetClass;
    }
  | {
      type: "result";
      index: number;
      total: number;
      symbol: string;
      name: string;
      logoUrl: string;
      assetType?: AssetClass;
      decision: string;
      confidence: number;
      reasoning: string;
      amountUsd: number;
      executed: boolean;
      votes?: ModelVote[];
    }
  | { type: "complete"; tradesExecuted: number; entriesEvaluated: number }
  | { type: "error"; message: string };

interface ModelVote {
  model: "claude" | "gpt" | "gemini";
  signal: "buy" | "sell" | "hold";
  confidence: number;
}

interface AssetResult {
  symbol: string;
  name: string;
  logoUrl: string;
  assetType?: AssetClass;
  decision: string;
  confidence: number;
  reasoning: string;
  amountUsd: number;
  executed: boolean;
  votes?: ModelVote[];
  pending?: boolean;
}

const VOTE_MODEL_LABEL: Record<ModelVote["model"], string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
};

function VoteBadges({ votes }: { votes?: ModelVote[] }) {
  if (!votes || votes.length === 0) return null;
  return (
    <span className="flex items-center gap-1 shrink-0">
      {votes.map((v) => {
        const cls =
          v.signal === "buy"
            ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
            : v.signal === "sell"
              ? "text-red-500 border-red-500/30 bg-red-500/10"
              : "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
        return (
          <span
            key={v.model}
            title={`${VOTE_MODEL_LABEL[v.model]}: ${v.signal.toUpperCase()} (${v.confidence}%)`}
            className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}
          >
            {VOTE_MODEL_LABEL[v.model]}{" "}
            {v.signal === "buy" ? "▲" : v.signal === "sell" ? "▼" : "•"}
          </span>
        );
      })}
    </span>
  );
}

function AssetBadge({ assetType }: { assetType?: AssetClass }) {
  if (!assetType) return null;
  const meta = ASSET_CLASS_META[assetType];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.badgeClass}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 75
      ? "bg-emerald-500"
      : value >= 55
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold">
        {Math.round(value)}%
      </span>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            {label}
          </div>
          <div className="text-xl font-bold font-mono">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function LogEntry({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const dc =
    log.decision === "BUY"
      ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
      : log.decision === "SELL"
        ? "text-red-500 border-red-500/30 bg-red-500/10"
        : "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
  const DIcon =
    log.decision === "BUY"
      ? TrendingUp
      : log.decision === "SELL"
        ? TrendingDown
        : Minus;
  // Guess asset type from symbol for display
  const assetType: AssetClass =
    log.symbol.includes("-PERP") || log.symbol.endsWith("-FUT")
      ? "futures"
      : COMMODITY_SYMBOLS.has(log.symbol)
        ? "commodity"
        : Object.keys(
              ASSET_CLASS_META.stock.assets.reduce((a: any, x) => {
                a[x.symbol] = 1;
                return a;
              }, {}),
            ).includes(log.symbol)
          ? "stock"
          : log.symbol.length === 6 &&
              ![
                "BTC",
                "ETH",
                "SOL",
                "BNB",
                "XRP",
                "ADA",
                "DOT",
                "LINK",
                "DOGE",
                "AVAX",
                "MATIC",
              ].includes(log.symbol)
            ? "forex"
            : "crypto";

  return (
    <div
      className={`border rounded-lg overflow-hidden ${log.executed ? "border-primary/20 bg-primary/5" : "border-border bg-muted/20"}`}
    >
      <button
        className="w-full text-left p-3 flex items-center gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {log.logoUrl ? (
            <img
              src={log.logoUrl}
              alt={log.symbol}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-xs font-bold">{log.symbol.slice(0, 2)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm">{log.symbol}</span>
            <AssetBadge assetType={assetType} />
            <Badge variant="outline" className={`text-xs ${dc}`}>
              <DIcon className="w-3 h-3 mr-0.5" />
              {log.decision}
            </Badge>
            {log.executed && (
              <Badge
                variant="outline"
                className="text-xs text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
              >
                <Check className="w-3 h-3 mr-0.5" />
                Executed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <ConfidenceBar value={log.confidence} />
            {log.amountUsd > 0 && (
              <span className="text-xs font-mono text-muted-foreground">
                ${log.amountUsd.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">
            {format(new Date(log.createdAt), "HH:mm")}
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">
            {log.reasoning}
          </p>
          <div className="text-xs text-muted-foreground mt-1">
            {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
          </div>
        </div>
      )}
    </div>
  );
}

function RunProgress({
  assetResults,
  currentSymbol,
  progress,
  total,
  marketSentiment,
  isComplete,
  tradesExecuted,
  runCount,
}: {
  assetResults: AssetResult[];
  currentSymbol: string | null;
  progress: number;
  total: number;
  marketSentiment: string;
  isComplete: boolean;
  tradesExecuted: number;
  runCount: number;
}) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            )}
            <span className="font-semibold text-sm">
              {isComplete
                ? `Run #${runCount} complete — ${tradesExecuted} trade${tradesExecuted !== 1 ? "s" : ""} executed`
                : `Run #${runCount} — analyzing ${currentSymbol ?? "..."}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {marketSentiment && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Crypto:{" "}
                <span className="font-semibold text-foreground">
                  {marketSentiment}
                </span>
              </span>
            )}
            <span className="text-xs text-muted-foreground font-mono">
              {progress}/{total}
            </span>
          </div>
        </div>
        <Progress value={pct} className="h-2" />
        {assetResults.length > 0 && (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {assetResults.map((r) => {
              const dc = r.pending
                ? "text-muted-foreground border-border bg-muted/20"
                : r.decision === "buy"
                  ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                  : r.decision === "sell"
                    ? "text-red-500 border-red-500/30 bg-red-500/10"
                    : "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
              return (
                <div
                  key={r.symbol}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${dc}`}
                >
                  <div className="w-5 h-5 rounded-full bg-background/50 flex items-center justify-center overflow-hidden shrink-0">
                    {r.logoUrl ? (
                      <img
                        src={r.logoUrl}
                        alt={r.symbol}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] font-bold">
                        {r.symbol.slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <span className="font-bold w-16 shrink-0">{r.symbol}</span>
                  {r.assetType && <AssetBadge assetType={r.assetType} />}
                  {r.pending ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analyzing...
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-bold uppercase">{r.decision}</span>
                      <span className="text-muted-foreground">
                        {r.confidence}%
                      </span>
                      {r.executed && (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 h-4 text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                        >
                          ✓
                        </Badge>
                      )}
                      <VoteBadges votes={r.votes} />
                      <span
                        className="text-muted-foreground truncate flex-1"
                        title={r.reasoning}
                      >
                        {r.reasoning}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AutoTrade() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading: isSettingsLoading } =
    useGetAutoTradeSettings();
  const { data: logs, isLoading: isLogsLoading } = useListAutoTradeLog();
  const { data: portfolio } = useGetPortfolio();
  const updateSettings = useUpdateAutoTradeSettings();

  // Settings state
  const [enabled, setEnabled] = useState(false);
  const [riskLevel, setRiskLevel] =
    useState<AutoTradeSettingsInputRiskLevel>("moderate");
  const [maxTradeAmount, setMaxTradeAmount] = useState("500");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [runMode, setRunMode] = useState<RunMode>("interval");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([
    "crypto",
    "stock",
    "forex",
    "futures",
    "commodity",
  ]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [nextRunSeconds, setNextRunSeconds] = useState<number | null>(null);

  // SSE run state
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [runCurrentSymbol, setRunCurrentSymbol] = useState<string | null>(null);
  const [runMarketSentiment, setRunMarketSentiment] = useState("");
  const [runAssetResults, setRunAssetResults] = useState<AssetResult[]>([]);
  const [runComplete, setRunComplete] = useState(false);
  const [runTradesExecuted, setRunTradesExecuted] = useState(0);
  const [runCount, setRunCount] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const runModeRef = useRef<RunMode>("interval");
  const enabledRef = useRef(false);
  const autoRunTriggeredFor = useRef<string | null>(null);
  const runStartInFlight = useRef(false);
  const initialized = useRef(false);

  useEffect(() => {
    runModeRef.current = runMode;
  }, [runMode]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (settings && !initialized.current) {
      setEnabled(settings.enabled);
      setRiskLevel(
        (settings.riskLevel as AutoTradeSettingsInputRiskLevel) || "moderate",
      );
      setMaxTradeAmount(settings.maxTradeAmountUsd?.toString() || "500");
      setIntervalMinutes(settings.intervalMinutes?.toString() || "60");
      setRunMode(((settings as any).runMode || "interval") as RunMode);
      setScheduledTime((settings as any).scheduledTime || "09:00");
      const classes = ((settings as any).assetClasses || "crypto")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean) as AssetClass[];
      setAssetClasses(classes);
      initialized.current = true;
    }
  }, [settings]);

  // Countdown timer — interval mode only
  useEffect(() => {
    const rm = (settings as any)?.runMode || "interval";
    if (!settings?.enabled || !settings?.lastRunAt || rm !== "interval") {
      setNextRunSeconds(null);
      return;
    }
    const tick = () => {
      const lastRun = new Date(settings.lastRunAt!).getTime();
      const intervalMs = (settings.intervalMinutes || 60) * 60 * 1000;
      setNextRunSeconds(
        Math.max(0, Math.floor((lastRun + intervalMs - Date.now()) / 1000)),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [settings]);

  const toggleAssetClass = (cls: AssetClass) => {
    setAssetClasses((prev) => {
      if (prev.includes(cls)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((c) => c !== cls);
      }
      return [...prev, cls];
    });
    setSelectedSymbols([]); // reset symbol filter when classes change
  };

  const toggleSymbol = (symbol: string) =>
    setSelectedSymbols((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol],
    );

  const handleSave = () => {
    const body = {
      enabled,
      riskLevel,
      maxTradeAmountUsd: Number(maxTradeAmount),
      intervalMinutes: Number(intervalMinutes),
      runMode,
      scheduledTime: runMode === "scheduled" ? scheduledTime : null,
      assetClasses: assetClasses.join(","),
    };
    fetch("/api/auto-trade/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
        toast({ title: "Settings saved" });
        queryClient.invalidateQueries({
          queryKey: getGetAutoTradeSettingsQueryKey(),
        });
      })
      .catch(() =>
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save settings.",
        }),
      );
  };

  const handleStop = () => {
    esRef.current?.close();
    esRef.current = null;
    setIsRunning(false);
    setRunCurrentSymbol(null);
    fetch("/api/auto-trade/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: false,
        riskLevel,
        maxTradeAmountUsd: Number(maxTradeAmount),
        intervalMinutes: Number(intervalMinutes),
        runMode,
        assetClasses: assetClasses.join(","),
      }),
    }).then(() => {
      setEnabled(false);
      enabledRef.current = false;
      toast({
        title: "Bot stopped",
        description: "Auto-trading has been paused.",
      });
      queryClient.invalidateQueries({
        queryKey: getGetAutoTradeSettingsQueryKey(),
      });
    });
  };

  const handleRunNow = async (opts?: { skipSettingsSync?: boolean }) => {
    if (isRunning || runStartInFlight.current) return;
    runStartInFlight.current = true;

    // The server allows one cycle per strategy at a time (the day-trade bot is
    // independent). Check first so we can show a clear message instead of a
    // generic connection error when the long-term bot is already busy.
    try {
      const statusResp = await fetch("/api/auto-trade/run-status");
      if (statusResp.ok) {
        const status = await statusResp.json();
        if (status.longtermRunning) {
          toast({
            title: "Bot is already running",
            description:
              "A trading cycle is in progress (scheduled or background run). Wait for it to finish, then try again.",
          });
          runStartInFlight.current = false;
          return;
        }
      }
    } catch {
      /* if the check fails, proceed — the stream itself will surface errors */
    }

    // Apply the current trade size / risk settings before running, so the run
    // invests using what's on screen — no separate "Save" click required.
    if (!opts?.skipSettingsSync) {
      const tradeAmount = Number(maxTradeAmount);
      if (!Number.isFinite(tradeAmount) || tradeAmount < 1) {
        toast({
          variant: "destructive",
          title: "Invalid trade size",
          description: "Max trade amount must be at least $1.",
        });
        runStartInFlight.current = false;
        return;
      }
      try {
        const resp = await fetch("/api/auto-trade/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled,
            riskLevel,
            maxTradeAmountUsd: tradeAmount,
            intervalMinutes: Number(intervalMinutes),
            runMode,
            scheduledTime: runMode === "scheduled" ? scheduledTime : null,
            assetClasses: assetClasses.join(","),
          }),
        });
        if (resp.status === 401) {
          toast({
            variant: "destructive",
            title: "Session expired",
            description: "Please sign in again, then start the run.",
          });
          runStartInFlight.current = false;
          return;
        }
        if (!resp.ok)
          throw new Error(`Failed to apply settings (${resp.status})`);
        queryClient.invalidateQueries({
          queryKey: getGetAutoTradeSettingsQueryKey(),
        });
      } catch {
        toast({
          variant: "destructive",
          title: "Couldn't apply settings",
          description: "Your settings weren't saved, so the run was cancelled.",
        });
        runStartInFlight.current = false;
        return;
      }
    }

    setIsRunning(true);
    setRunComplete(false);
    setRunProgress(0);
    setRunTotal(0);
    setRunCurrentSymbol(null);
    setRunMarketSentiment("");
    setRunAssetResults([]);
    setRunTradesExecuted(0);
    setRunCount((c) => c + 1);
    runStartInFlight.current = false;

    const coinParam =
      selectedSymbols.length > 0 ? `?coins=${selectedSymbols.join(",")}` : "";
    const es = new EventSource(`/api/auto-trade/run-stream${coinParam}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event: ProgressEvent = JSON.parse(e.data);
      if (event.type === "start") {
        setRunTotal(event.total);
        setRunMarketSentiment(event.marketSentiment);
      } else if (event.type === "analyzing") {
        setRunCurrentSymbol(event.symbol);
        setRunAssetResults((prev) => {
          if (prev.find((r) => r.symbol === event.symbol)) return prev;
          return [
            ...prev,
            {
              symbol: event.symbol,
              name: event.name,
              logoUrl: event.logoUrl,
              assetType: event.assetType,
              decision: "",
              confidence: 0,
              reasoning: "",
              amountUsd: 0,
              executed: false,
              pending: true,
            },
          ];
        });
      } else if (event.type === "result") {
        setRunProgress(event.index);
        setRunAssetResults((prev) =>
          prev.map((r) =>
            r.symbol === event.symbol
              ? {
                  ...r,
                  decision: event.decision,
                  confidence: event.confidence,
                  reasoning: event.reasoning,
                  amountUsd: event.amountUsd,
                  executed: event.executed,
                  assetType: event.assetType,
                  votes: event.votes,
                  pending: false,
                }
              : r,
          ),
        );
      } else if (event.type === "complete") {
        setRunComplete(true);
        setRunTradesExecuted(event.tradesExecuted);
        setIsRunning(false);
        setRunCurrentSymbol(null);
        es.close();
        esRef.current = null;
        queryClient.invalidateQueries({
          queryKey: getGetAutoTradeSettingsQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getListAutoTradeLogQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        if (runModeRef.current === "continuous" && enabledRef.current) {
          setTimeout(() => {
            if (enabledRef.current) handleRunNow({ skipSettingsSync: true });
          }, 2000);
        } else {
          toast({
            title: `Run complete — ${event.tradesExecuted} trade${event.tradesExecuted !== 1 ? "s" : ""} executed`,
            description: `Evaluated ${event.entriesEvaluated} assets.`,
          });
        }
      } else if (event.type === "error") {
        setIsRunning(false);
        es.close();
        esRef.current = null;
        toast({
          variant: "destructive",
          title: "Run failed",
          description: event.message,
        });
      }
    };
    es.onerror = async () => {
      setIsRunning(false);
      es.close();
      esRef.current = null;
      try {
        const statusResp = await fetch("/api/auto-trade/run-status");
        if (statusResp.ok) {
          const status = await statusResp.json();
          if (status.longtermRunning) {
            toast({
              title: "A trading cycle is still running on the server",
              description:
                "It will finish in the background — results appear in the activity log. Try Run Now again once it completes.",
            });
            return;
          }
        }
      } catch {
        /* fall through to generic message */
      }
      toast({
        variant: "destructive",
        title: "Connection lost",
        description:
          "The run stream was interrupted. Check the activity log — trades may still have executed.",
      });
    };
  };

  useEffect(() => {
    if (
      nextRunSeconds === 0 &&
      settings?.enabled &&
      settings?.lastRunAt &&
      !isRunning &&
      autoRunTriggeredFor.current !== settings.lastRunAt
    ) {
      autoRunTriggeredFor.current = settings.lastRunAt;
      handleRunNow({ skipSettingsSync: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRunSeconds]);

  useEffect(
    () => () => {
      esRef.current?.close();
    },
    [],
  );

  const showProgress = isRunning || runComplete;
  const isContinuousRunning = isRunning && runMode === "continuous";
  const isContinuousEnabled = enabled && runMode === "continuous";

  const statsFromLogs = logs
    ? {
        executed: logs.filter((l: any) => l.executed).length,
        buys: logs.filter((l: any) => l.decision === "BUY").length,
        sells: logs.filter((l: any) => l.decision === "SELL").length,
        avgConfidence:
          logs.length > 0
            ? Math.round(
                logs.reduce((s: number, l: any) => s + l.confidence, 0) /
                  logs.length,
              )
            : 0,
        volume: logs
          .filter((l: any) => l.executed)
          .reduce((s: number, l: any) => s + l.amountUsd, 0),
      }
    : null;

  const investedByBroker = portfolio
    ? portfolio.holdings.reduce(
        (acc: { alpaca: number; oanda: number }, h: any) => {
          const invested = h.currentValue - h.pnl;
          if (h.broker === "oanda") acc.oanda += invested;
          else acc.alpaca += invested;
          return acc;
        },
        { alpaca: 0, oanda: 0 },
      )
    : null;

  const formatUsd = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatSignedUsd = (n: number) =>
    `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const { data: pnl } = useGetAutoTradePnl(
    { strategy: "longterm" },
    {
      query: {
        queryKey: getGetAutoTradePnlQueryKey({ strategy: "longterm" }),
        refetchInterval: 30000,
      },
    },
  );

  const formatCountdown = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${sec.toString().padStart(2, "0")}s`;
  };

  const riskMeta = {
    conservative: {
      label: "Conservative",
      btnClass: "bg-teal-500 hover:bg-teal-600 text-white border-transparent",
      desc: "78% confidence min · 40% max size",
    },
    moderate: {
      label: "Moderate",
      btnClass:
        "bg-yellow-500 hover:bg-yellow-600 text-white border-transparent",
      desc: "62% confidence min · 70% max size",
    },
    aggressive: {
      label: "Aggressive",
      btnClass: "bg-red-500 hover:bg-red-600 text-white border-transparent",
      desc: "48% confidence min · Full size",
    },
  };

  const modeMeta: Record<
    RunMode,
    { icon: React.ElementType; label: string; desc: string }
  > = {
    interval: { icon: Timer, label: "Interval", desc: "Run every X minutes" },
    continuous: {
      icon: Repeat,
      label: "Non-Stop",
      desc: "Runs back-to-back until stopped",
    },
    scheduled: {
      icon: CalendarClock,
      label: "Scheduled",
      desc: "Run once at a set time each day",
    },
  };

  // All symbols available across selected asset classes
  const availableSymbols = assetClasses.flatMap(
    (cls) => ASSET_CLASS_META[cls].assets,
  );

  return (
    <div className="space-y-6 pb-20">
      <AutoTradeAlertBanner />
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              AI Auto-Trader
            </h1>
            <Badge
              variant={enabled ? "default" : "secondary"}
              className={
                enabled
                  ? "bg-emerald-500 hover:bg-emerald-600 animate-pulse"
                  : ""
              }
            >
              {isRunning ? "● RUNNING" : enabled ? "● LIVE" : "○ OFF"}
            </Badge>
            {assetClasses.map((cls) => {
              const m = ASSET_CLASS_META[cls];
              const Icon = m.icon;
              return (
                <Badge
                  key={cls}
                  variant="outline"
                  className={`text-xs ${m.badgeClass}`}
                >
                  <Icon className="w-3 h-3 mr-1" />
                  {m.label}
                </Badge>
              );
            })}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-md border border-border text-xs text-muted-foreground">
              <Server className="w-3 h-3 text-emerald-500" />
              <span>Server-side scheduling</span>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            Claude AI analyzes crypto, stocks, forex, and futures — executes
            trades automatically.
          </p>
          {enabled && (
            <p className="text-xs text-emerald-500 mt-1">
              The bot runs on the server — you can close this tab and it keeps
              trading until you press Stop Bot. It buys and sells freely all
              day: the daily limit and max trade size only cap buys — sells are
              never capped (beyond your actual position), and every sell frees
              that budget for new trades until the day resets.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {runMode === "interval" && nextRunSeconds !== null && !isRunning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border border-border">
              <Clock className="w-4 h-4" />
              Next run{" "}
              <span className="font-mono font-semibold text-foreground ml-1">
                {formatCountdown(nextRunSeconds)}
              </span>
            </div>
          )}
          {runMode === "scheduled" && (settings as any)?.scheduledTime && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border border-border">
              <CalendarClock className="w-4 h-4" />
              Runs daily at{" "}
              <span className="font-mono font-semibold text-foreground ml-1">
                {(settings as any).scheduledTime}
              </span>
            </div>
          )}
          {isContinuousRunning && (
            <div className="flex items-center gap-2 text-sm text-orange-400 bg-orange-400/10 px-3 py-2 rounded-lg border border-orange-400/30">
              <Repeat
                className="w-4 h-4 animate-spin"
                style={{ animationDuration: "3s" }}
              />
              Running non-stop
            </div>
          )}
          {isContinuousRunning || isContinuousEnabled ? (
            <Button
              onClick={handleStop}
              variant="destructive"
              className="gap-2 shadow-[0_4px_14px_rgba(239,68,68,0.25)]"
            >
              <StopCircle className="w-4 h-4" />
              Stop Bot
            </Button>
          ) : (
            <Button
              onClick={() => handleRunNow()}
              disabled={isRunning}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_14px_rgba(34,197,94,0.2)]"
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isRunning ? "Running..." : "Run Now"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {statsFromLogs && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={Activity}
            label="Trades Executed"
            value={String(statsFromLogs.executed)}
            sub="all time"
          />
          <StatCard
            icon={BarChart3}
            label="Avg Confidence"
            value={`${statsFromLogs.avgConfidence}%`}
            sub="across all signals"
          />
          <StatCard
            icon={TrendingUp}
            label="Buy Signals"
            value={String(statsFromLogs.buys)}
            sub={`${statsFromLogs.sells} sells`}
          />
          <StatCard
            icon={DollarSign}
            label="Volume Traded"
            value={`$${statsFromLogs.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            sub="total USD routed"
          />
        </div>
      )}

      {/* Capital invested across brokerage accounts */}
      {portfolio && investedByBroker && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              Money Invested — All Brokerage Accounts
            </CardTitle>
            <CardDescription>
              Capital currently deployed in open positions across your connected
              brokers, plus cash still available to the bot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1">
                  Total Invested
                </div>
                <div className="text-xl font-bold">
                  {formatUsd(portfolio.totalInvested)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  across all brokers
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Alpaca
                  {!portfolio.alpacaConnected && (
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      not connected
                    </Badge>
                  )}
                </div>
                <div className="text-xl font-bold">
                  {portfolio.alpacaConnected
                    ? formatUsd(investedByBroker.alpaca)
                    : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  stocks &amp; crypto
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  OANDA
                  {!portfolio.oandaConnected && (
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      not connected
                    </Badge>
                  )}
                </div>
                <div className="text-xl font-bold">
                  {portfolio.oandaConnected
                    ? formatUsd(investedByBroker.oanda)
                    : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  forex, commodities &amp; CFDs
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1">
                  Cash Available
                </div>
                <div className="text-xl font-bold">
                  {formatUsd(portfolio.usdBalance)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  not yet invested
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bot performance (P&L) */}
      {pnl && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {(pnl.totalRealizedPnlUsd ?? 0) >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              Long-Term Bot Performance — What You Made or Lost
            </CardTitle>
            <CardDescription>
              Realized profit and loss from the long-term auto-trader's
              completed buy→sell round trips over the last {pnl.windowDays}{" "}
              days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1">
                  Realized P&L
                </div>
                <div
                  className={`text-xl font-bold ${pnl.totalRealizedPnlUsd == null ? "" : pnl.totalRealizedPnlUsd >= 0 ? "text-emerald-500" : "text-red-500"}`}
                >
                  {pnl.totalRealizedPnlUsd == null
                    ? "—"
                    : formatSignedUsd(pnl.totalRealizedPnlUsd)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  closed round trips
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1">
                  Bot Bought
                </div>
                <div className="text-xl font-bold">
                  {formatUsd(pnl.totalBuysUsd)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  total buy spend
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1">
                  Bot Sold
                </div>
                <div className="text-xl font-bold">
                  {formatUsd(pnl.totalSellsUsd)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  total sell proceeds
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-xs text-muted-foreground mb-1">Trades</div>
                <div className="text-xl font-bold">{pnl.executedTrades}</div>
                <div className="text-[11px] text-muted-foreground">
                  executed by the bot
                </div>
              </div>
            </div>

            {pnl.positions.length > 0 ? (
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                      <th className="text-left font-medium px-3 py-2">Asset</th>
                      <th className="text-left font-medium px-3 py-2">
                        Broker
                      </th>
                      <th className="text-right font-medium px-3 py-2">
                        Made / Lost
                      </th>
                      <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">
                        Bought
                      </th>
                      <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">
                        Sold
                      </th>
                      <th className="text-right font-medium px-3 py-2 hidden md:table-cell">
                        Still Held
                      </th>
                      <th className="text-right font-medium px-3 py-2">
                        Trades
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.positions.map((p) => (
                      <tr
                        key={`${p.broker}-${p.symbol}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2 font-medium">{p.symbol}</td>
                        <td className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 h-4 uppercase"
                          >
                            {p.broker}
                          </Badge>
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono font-semibold ${p.realizedPnlUsd == null ? "text-muted-foreground" : p.realizedPnlUsd >= 0 ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {p.realizedPnlUsd == null
                            ? "—"
                            : formatSignedUsd(p.realizedPnlUsd)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono hidden sm:table-cell">
                          {formatUsd(p.buysUsd)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono hidden sm:table-cell">
                          {formatUsd(p.sellsUsd)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono hidden md:table-cell">
                          {p.openQty > 0
                            ? `${p.openQty.toLocaleString(undefined, { maximumFractionDigits: 6 })}${p.avgCostUsd != null ? ` @ ${formatUsd(p.avgCostUsd)}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">{p.trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No bot trades in the last {pnl.windowDays} days yet — once the
                auto-trader buys and sells, your profit and loss will show up
                here.
              </p>
            )}
            {pnl.positions.some((p) => p.realizedPnlUsd == null) && (
              <p className="text-[11px] text-muted-foreground">
                — means older trades are missing fill details, so an exact
                profit figure isn't available for that asset. New trades record
                full fill data automatically.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Live progress */}
      {showProgress && (
        <RunProgress
          assetResults={runAssetResults}
          currentSymbol={runCurrentSymbol}
          progress={runProgress}
          total={runTotal}
          marketSentiment={runMarketSentiment}
          isComplete={runComplete}
          tradesExecuted={runTradesExecuted}
          runCount={runCount}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Settings */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4 text-muted-foreground" />
                Long-Term Bot Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {isSettingsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Enable toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                    <div>
                      <Label className="font-semibold">Auto-Trading</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {enabled ? "Active" : "Paused"}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => {
                        setEnabled(v);
                        enabledRef.current = v;
                      }}
                    />
                  </div>

                  {/* Asset Classes */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Asset Markets
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          "crypto",
                          "stock",
                          "forex",
                          "futures",
                          "commodity",
                        ] as AssetClass[]
                      ).map((cls) => {
                        const meta = ASSET_CLASS_META[cls];
                        const active = assetClasses.includes(cls);
                        const Icon = meta.icon;
                        return (
                          <button
                            key={cls}
                            onClick={() => toggleAssetClass(cls)}
                            className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-sm font-semibold ${
                              active
                                ? `border-current ${meta.badgeClass}`
                                : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/20"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {meta.label}
                            {cls === "futures" && (
                              <span className="text-[10px] font-normal ml-auto opacity-70">
                                10x
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Claude will analyze and trade assets from all selected
                      markets.
                    </p>
                    {assetClasses.includes("futures") && (
                      <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-purple-300">
                        ⚡ Futures use 10x leverage. Claude requires higher
                        confidence (65%+) before entering these positions.
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Run Mode */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Run Mode
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(
                        ["interval", "continuous", "scheduled"] as RunMode[]
                      ).map((m) => {
                        const meta = modeMeta[m];
                        const active = runMode === m;
                        const MIcon = meta.icon;
                        return (
                          <button
                            key={m}
                            onClick={() => setRunMode(m)}
                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-xs font-semibold ${
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/20"
                            }`}
                          >
                            <MIcon className="w-5 h-5" />
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-start gap-2 p-2 bg-muted/20 rounded-md text-xs text-muted-foreground">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" />
                      {modeMeta[runMode].desc}
                    </div>
                  </div>

                  {runMode === "interval" && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Run Interval
                      </Label>
                      <Select
                        value={intervalMinutes}
                        onValueChange={setIntervalMinutes}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Every 1 minute</SelectItem>
                          <SelectItem value="2">Every 2 minutes</SelectItem>
                          <SelectItem value="5">Every 5 minutes</SelectItem>
                          <SelectItem value="10">Every 10 minutes</SelectItem>
                          <SelectItem value="15">Every 15 minutes</SelectItem>
                          <SelectItem value="30">Every 30 minutes</SelectItem>
                          <SelectItem value="60">Every hour</SelectItem>
                          <SelectItem value="120">Every 2 hours</SelectItem>
                          <SelectItem value="240">Every 4 hours</SelectItem>
                          <SelectItem value="480">Every 8 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {runMode === "scheduled" && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Time of Day (24h)
                      </Label>
                      <div className="relative">
                        <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="time"
                          className="pl-9 font-mono"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {runMode === "continuous" && (
                    <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                      <p className="text-xs text-orange-400 font-semibold mb-1">
                        ⚡ Non-Stop Mode
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Runs continuously until you click{" "}
                        <strong>Stop Bot</strong>.
                      </p>
                    </div>
                  )}

                  <Separator />

                  {/* Risk Level */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Risk Level
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(
                        ["conservative", "moderate", "aggressive"] as const
                      ).map((r) => (
                        <button
                          key={r}
                          onClick={() => setRiskLevel(r)}
                          className={`py-2 px-1 rounded-lg text-xs font-bold transition-all border ${riskLevel === r ? riskMeta[r].btnClass : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/20"}`}
                        >
                          {riskMeta[r].label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {riskMeta[riskLevel].desc}
                    </p>
                  </div>

                  {/* Max trade size */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Max Trade Size (USD)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                        $
                      </span>
                      <Input
                        type="number"
                        className="pl-7"
                        value={maxTradeAmount}
                        onChange={(e) => setMaxTradeAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleSave}>
                      Save Settings
                    </Button>
                    {(isRunning || isContinuousEnabled) && (
                      <Button
                        variant="destructive"
                        onClick={handleStop}
                        className="gap-1.5"
                      >
                        <StopCircle className="w-4 h-4" />
                        Stop
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Symbol filter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                Symbol Filter
              </CardTitle>
              <CardDescription className="text-xs">
                Pin specific symbols, or leave all clear to let the bot
                auto-pick from your selected markets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {assetClasses.map((cls) => {
                const meta = ASSET_CLASS_META[cls];
                const Icon = meta.icon;
                return (
                  <div key={cls}>
                    <div
                      className={`flex items-center gap-1.5 text-xs font-bold mb-2 ${meta.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {meta.label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {meta.assets.map((asset) => {
                        const active = selectedSymbols.includes(asset.symbol);
                        return (
                          <button
                            key={asset.symbol}
                            onClick={() => toggleSymbol(asset.symbol)}
                            className={`px-2 py-1 rounded-md text-xs font-bold border transition-all ${active ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                            title={asset.name}
                          >
                            {asset.symbol}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {selectedSymbols.length > 0 && (
                <button
                  onClick={() => setSelectedSymbols([])}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Clear selection (use auto-pick)
                </button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Decision Log */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    AI Decision Log
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Click any entry to expand full reasoning
                  </CardDescription>
                </div>
                <button
                  onClick={() =>
                    queryClient.invalidateQueries({
                      queryKey: getListAutoTradeLogQueryKey(),
                    })
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {isLogsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !logs || logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-72 text-center text-muted-foreground">
                  <Bot className="w-14 h-14 mb-4 opacity-20" />
                  <p className="font-semibold">No runs yet</p>
                  <p className="text-sm mt-1 max-w-xs">
                    Select your markets, then press{" "}
                    <span className="font-mono bg-muted px-1 rounded">
                      Run Now
                    </span>{" "}
                    to start.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
                  {logs.slice(0, 50).map((log: any) => (
                    <LogEntry key={log.id} log={log} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Real-money activity feed */}
      <AutoTradeActivityFeed />
    </div>
  );
}
