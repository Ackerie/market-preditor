import { CandlestickChart, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AutoTradeAlertBanner } from "@/components/auto-trade-alerts";
import DayTradePanel from "@/components/day-trade-panel";

export default function DayTrade() {
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
