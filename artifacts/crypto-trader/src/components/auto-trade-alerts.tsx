import {
  useGetAutoTradeAlerts,
  getGetAutoTradeAlertsQueryKey,
  useListAutoTradeEvents,
  getListAutoTradeEventsQueryKey,
  type AutoTradeAlerts,
  type AutoTradeEvent,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Ban, Check, SkipForward, XCircle, Activity, Zap } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

export function useAutoTradeAlerts() {
  return useGetAutoTradeAlerts({
    query: { queryKey: getGetAutoTradeAlertsQueryKey(), refetchInterval: 30000 },
  });
}

export function AutoTradeAlertBanner() {
  const { data: alerts } = useAutoTradeAlerts();
  if (!alerts) return null;

  const banners: Array<{ key: string; tone: "warn" | "error"; text: string }> = [];

  const capBanner = (broker: "alpaca" | "oanda", label: string) => {
    const a = alerts[broker];
    if (a.connected && a.autoTradeEnabled && a.dailyLimitReached) {
      banners.push({
        key: `${broker}-cap`,
        tone: "warn",
        text: `${label} daily auto-trade limit reached — $${a.spentTodayUsd.toFixed(2)} of $${a.dailyLimitUsd.toFixed(2)} spent today. New auto-trades are paused until tomorrow (UTC).`,
      });
    }
    if (a.connected && a.recentRejections > 0) {
      banners.push({
        key: `${broker}-rej`,
        tone: "error",
        text: `${label} rejected ${a.recentRejections} auto-trade order${a.recentRejections !== 1 ? "s" : ""} in the last 24 hours.${broker === "alpaca" && alerts.lastRejectionMessage ? "" : ""}`,
      });
    }
  };
  capBanner("alpaca", "Alpaca");
  capBanner("oanda", "OANDA");

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2">
      {banners.map((b) => (
        <div
          key={b.key}
          className={`flex items-start gap-2 p-3 rounded-md text-sm ${
            b.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
          }`}
        >
          {b.tone === "error" ? <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <div>
            {b.text}
            {b.tone === "error" && alerts.lastRejectionMessage && (
              <span className="block text-xs opacity-80 mt-0.5">{alerts.lastRejectionMessage}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const OUTCOME_META: Record<string, { icon: React.ElementType; label: string; badgeClass: string }> = {
  executed: { icon: Check, label: "Executed", badgeClass: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" },
  skipped: { icon: SkipForward, label: "Skipped", badgeClass: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" },
  rejected: { icon: Ban, label: "Rejected", badgeClass: "text-red-500 border-red-500/30 bg-red-500/10" },
};

function EventRow({ event }: { event: AutoTradeEvent }) {
  const meta = OUTCOME_META[event.outcome] ?? OUTCOME_META.skipped;
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg border-border bg-muted/20">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm">{event.symbol}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{event.broker}</Badge>
          <Badge variant="outline" className={`text-xs ${event.side === "buy" ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30"}`}>
            {event.side.toUpperCase()}
          </Badge>
          <Badge variant="outline" className={`text-xs ${meta.badgeClass}`}>
            <Icon className="w-3 h-3 mr-0.5" />{meta.label}
          </Badge>
          {event.strategy === "daytrade" && (
            <Badge variant="outline" className="text-[10px] text-sky-500 border-sky-500/30 bg-sky-500/10">
              <Zap className="w-3 h-3 mr-0.5" />Day-trade
            </Badge>
          )}
          {event.notionalUsd > 0 && (
            <span className="text-xs font-mono text-muted-foreground">${event.notionalUsd.toFixed(2)}</span>
          )}
        </div>
        {event.message && <p className="text-xs text-muted-foreground mt-1">{event.message}</p>}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{format(new Date(event.createdAt), "MMM d, HH:mm")}</span>
    </div>
  );
}

export function AutoTradeActivityFeed() {
  const { data: events, isLoading } = useListAutoTradeEvents({
    query: { queryKey: getListAutoTradeEventsQueryKey(), refetchInterval: 30000 },
  });
  const [tab, setTab] = useState<"all" | "daytrade">("all");

  const filtered = (events ?? []).filter((e) => (tab === "daytrade" ? e.strategy === "daytrade" : true));
  const dayCount = (events ?? []).filter((e) => e.strategy === "daytrade").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5" /> Your auto-trade activity
            </CardTitle>
            <CardDescription>
              Real-money outcomes on your broker accounts — executed orders, skipped trades, and broker rejections.
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setTab("all")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${tab === "all" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              All trades{events ? ` (${events.length})` : ""}
            </button>
            <button
              onClick={() => setTab("daytrade")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${tab === "daytrade" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Day trades{events ? ` (${dayCount})` : ""}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {tab === "daytrade"
              ? "No day-trade activity yet. When the day-trade bot trades on your linked broker accounts, the outcome will show here."
              : "No activity yet. When the AI bot trades (or tries to) on your linked broker accounts, the outcome will show here."}
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map((e) => <EventRow key={e.id} event={e} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
