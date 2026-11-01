import { useEffect, useState } from "react";
import { CandlestickChart, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AutoTradeAlertBanner } from "@/components/auto-trade-alerts";
import DayTradePanel from "@/components/day-trade-panel";

export default function DayTrade() {
  const [featureAccess, setFeatureAccess] = useState<{ dayTrade: boolean }>({ dayTrade: true });

  useEffect(() => {
    let active = true;
    fetch("/api/app-access", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { featureAccess?: { dayTrade?: boolean } };
        if (!active) return;
        setFeatureAccess({ dayTrade: data.featureAccess?.dayTrade ?? true });
      })
      .catch(() => {
        if (active) setFeatureAccess({ dayTrade: true });
      });

    return () => {
      active = false;
    };
  }, []);

  if (!featureAccess.dayTrade) {
    return (
      <div className="space-y-6 pb-20">
        <AutoTradeAlertBanner />
        <Card className="border-amber-400/40 bg-amber-500/10">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-amber-500/15 p-3 text-amber-300">
                <CandlestickChart className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                  Premium access required
                </p>
                <h2 className="text-2xl font-bold">Day trading is part of the paid plan.</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Automated intraday execution is locked by the operator. Enable paid access to reactivate the day-trade bot and live decision engine.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <AutoTradeAlertBanner />
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
          <CandlestickChart className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Day Trade
            </h1>
            <Badge
              variant="outline"
              className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
            >
              <ShieldCheck className="w-3 h-3 mr-1" /> Independent strategy
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Intraday execution on 5-minute market candles. Review the bot's
            entry, stop-loss, take-profit, latest price, and trade markers from
            one workspace.
          </p>
        </div>
      </div>
      <DayTradePanel />
    </div>
  );
}
