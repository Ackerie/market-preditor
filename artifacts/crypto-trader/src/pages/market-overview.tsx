import { useState } from "react";
import { useListCoins, useGetMarketSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, CoinIcon } from "@/components/shared";
import { ArrowUp, ArrowDown, BarChart2, Globe, TrendingUp, DollarSign, Radio } from "lucide-react";
import LiveUpdates from "@/pages/live-updates";

type AssetType = "crypto" | "stock" | "forex" | "futures" | "commodity";

const TABS: { value: AssetType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "crypto", label: "Crypto" },
  { value: "stock", label: "Stocks" },
  { value: "forex", label: "Forex" },
  { value: "futures", label: "Futures" },
  { value: "commodity", label: "Commodities" },
];

function changeColor(change: number): string {
  if (change <= -5) return "bg-red-900/90 text-red-100";
  if (change <= -2) return "bg-red-700/80 text-red-100";
  if (change <= -0.5) return "bg-red-500/60 text-red-100";
  if (change < 0.5) return "bg-muted/60 text-muted-foreground";
  if (change < 2) return "bg-emerald-700/40 text-emerald-200";
  if (change < 5) return "bg-emerald-600/70 text-emerald-100";
  return "bg-emerald-500/90 text-emerald-50";
}

function changeBorderColor(change: number): string {
  if (change <= -2) return "border-red-700/50";
  if (change < 0) return "border-red-500/30";
  if (change < 2) return "border-emerald-700/30";
  return "border-emerald-600/50";
}

export default function MarketOverview() {
  const [view, setView] = useState<"overview" | "live">(
    new URLSearchParams(window.location.search).get("view") === "live" ? "live" : "overview"
  );
  const [tab, setTab] = useState<AssetType | "all">("all");

  const { data: allCoins, isLoading: coinsLoading } = useListCoins();
  const { data: marketSummary } = useGetMarketSummary();

  const cryptoCoins = allCoins?.filter((c) => c.assetType === "crypto") ?? [];
  const stockCoins = allCoins?.filter((c) => c.assetType === "stock") ?? [];
  const forexCoins = allCoins?.filter((c) => c.assetType === "forex") ?? [];

  const baseFilteredCoins =
    tab === "all" ? (allCoins ?? []) : (allCoins ?? []).filter((c) => c.assetType === tab);

  const sorted = [...baseFilteredCoins].sort((a, b) => b.change24h - a.change24h);
  const topGainers = sorted.slice(0, 5);
  const topLosers = [...sorted].reverse().slice(0, 5);

  const cryptoMarketCap = cryptoCoins.reduce((s, c) => s + c.marketCap, 0);
  const avgCryptoChange = cryptoCoins.length
    ? cryptoCoins.reduce((s, c) => s + c.change24h, 0) / cryptoCoins.length
    : 0;
  const avgStockChange = stockCoins.length
    ? stockCoins.reduce((s, c) => s + c.change24h, 0) / stockCoins.length
    : 0;
  const avgForexChange = forexCoins.length
    ? forexCoins.reduce((s, c) => s + c.change24h, 0) / forexCoins.length
    : 0;

  const viewTabs = (
    <div className="flex p-1 bg-muted rounded-lg w-fit">
      {([
        { value: "overview" as const, label: "Overview", icon: Globe },
        { value: "live" as const, label: "Live Feed", icon: Radio },
      ]).map((t) => {
        const TIcon = t.icon;
        return (
          <button
            key={t.value}
            onClick={() => setView(t.value)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
              view === t.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TIcon className="w-4 h-4" /> {t.label}
          </button>
        );
      })}
    </div>
  );

  if (view === "live") {
    return (
      <div className="space-y-6 pb-20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Market</h1>
          {viewTabs}
        </div>
        <LiveUpdates />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Market</h1>
        <div className="flex items-center gap-3">
          {viewTabs}
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {allCoins?.length ?? 0} instruments tracked
          </Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Crypto */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" /> Crypto Market
                </p>
                {coinsLoading ? (
                  <Skeleton className="h-7 w-32 mt-1" />
                ) : (
                  <p className="text-2xl font-bold tracking-tight">
                    {cryptoMarketCap >= 1e12
                      ? `$${(cryptoMarketCap / 1e12).toFixed(2)}T`
                      : `$${(cryptoMarketCap / 1e9).toFixed(0)}B`}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{cryptoCoins.length} coins tracked</p>
              </div>
              <Badge
                className={`text-xs font-bold ${avgCryptoChange >= 0 ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-red-600/20 text-red-400 border-red-600/30"} border`}
              >
                {avgCryptoChange >= 0 ? "+" : ""}{formatPercent(avgCryptoChange)} avg
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Stocks */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1 flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4" /> Equities
                </p>
                {coinsLoading ? (
                  <Skeleton className="h-7 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold tracking-tight">{stockCoins.length} Stocks</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">US large-cap equities</p>
              </div>
              <Badge
                className={`text-xs font-bold ${avgStockChange >= 0 ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-red-600/20 text-red-400 border-red-600/30"} border`}
              >
                {avgStockChange >= 0 ? "+" : ""}{formatPercent(avgStockChange)} avg
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Forex */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1 flex items-center gap-1.5">
                  <Globe className="w-4 h-4" /> Forex & Commodities
                </p>
                {coinsLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold tracking-tight">{forexCoins.length} Pairs</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Major currency pairs + Gold</p>
              </div>
              <Badge
                className={`text-xs font-bold ${avgForexChange >= 0 ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-red-600/20 text-red-400 border-red-600/30"} border`}
              >
                {avgForexChange >= 0 ? "+" : ""}{formatPercent(avgForexChange)} avg
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Movers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUp className="w-4 h-4 text-emerald-400" />
              Top Gainers (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {coinsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-1.5">
                {topGainers.map((coin) => (
                  <div key={coin.symbol} className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <CoinIcon symbol={coin.symbol} logoUrl={coin.logoUrl} className="w-7 h-7" />
                      <div>
                        <p className="text-sm font-semibold leading-none">{coin.symbol}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{coin.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-medium">{formatCurrency(coin.price)}</p>
                      <p className="text-xs font-semibold text-emerald-400">+{formatPercent(coin.change24h)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDown className="w-4 h-4 text-red-400" />
              Top Losers (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {coinsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-1.5">
                {topLosers.map((coin) => (
                  <div key={coin.symbol} className="flex items-center justify-between py-2 px-3 rounded-lg bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <CoinIcon symbol={coin.symbol} logoUrl={coin.logoUrl} className="w-7 h-7" />
                      <div>
                        <p className="text-sm font-semibold leading-none">{coin.symbol}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{coin.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-medium">{formatCurrency(coin.price)}</p>
                      <p className="text-xs font-semibold text-red-400">{formatPercent(coin.change24h)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Heat Map */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              Performance Heat Map (24h)
            </CardTitle>
            <div className="flex p-0.5 bg-muted rounded-lg">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    tab === t.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-700/80"></span> Strong loss
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-muted/60"></span> Flat
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-600/70"></span> Strong gain
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {coinsLoading ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2">
              {Array.from({ length: 28 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2">
              {baseFilteredCoins.map((coin) => (
                <div
                  key={coin.symbol}
                  className={`${changeColor(coin.change24h)} ${changeBorderColor(coin.change24h)} border rounded-xl p-2.5 flex flex-col items-center justify-center text-center min-h-[80px] transition-opacity hover:opacity-90`}
                >
                  <CoinIcon symbol={coin.symbol} logoUrl={coin.logoUrl} className="w-6 h-6 mb-1.5" />
                  <p className="text-xs font-bold leading-none">{coin.symbol}</p>
                  <p className={`text-xs font-semibold mt-1 ${coin.change24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {coin.change24h >= 0 ? "+" : ""}{coin.change24h.toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
