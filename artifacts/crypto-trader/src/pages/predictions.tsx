import { useState } from "react";
import { 
  useListCoins, 
  useGetPrediction, 
  getGetPredictionQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, CoinIcon } from "@/components/shared";
import { BrainCircuit, Target, Calendar, ArrowRight, Bitcoin, BarChart2, Landmark, Zap, Gem } from "lucide-react";
import { format } from "date-fns";

const SIGNAL_COLORS: Record<string, string> = {
  strong_buy: "bg-chart-2 text-white border-chart-2",
  buy: "bg-chart-2/20 text-chart-2 border-chart-2/50",
  hold: "bg-chart-4/20 text-chart-4 border-chart-4/50",
  sell: "bg-chart-5/20 text-chart-5 border-chart-5/50",
  strong_sell: "bg-destructive text-white border-destructive",
};

const SIGNAL_LABELS: Record<string, string> = {
  strong_buy: "STRONG BUY",
  buy: "BUY",
  hold: "HOLD",
  sell: "SELL",
  strong_sell: "STRONG SELL",
};

type AssetClass = "crypto" | "stock" | "forex" | "futures" | "commodity";

const ASSET_CLASS_META: Record<AssetClass, { icon: React.ElementType; label: string; activeClass: string; badgeClass: string }> = {
  crypto:  { icon: Bitcoin,   label: "Crypto",  activeClass: "border-orange-400 bg-orange-400/10 text-orange-400",  badgeClass: "border-orange-400/40 bg-orange-400/10 text-orange-400" },
  stock:   { icon: BarChart2, label: "Stocks",  activeClass: "border-blue-400 bg-blue-400/10 text-blue-400",        badgeClass: "border-blue-400/40 bg-blue-400/10 text-blue-400" },
  forex:   { icon: Landmark,  label: "Forex",   activeClass: "border-emerald-400 bg-emerald-400/10 text-emerald-400", badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400" },
  futures: { icon: Zap,       label: "Futures", activeClass: "border-purple-400 bg-purple-400/10 text-purple-400",  badgeClass: "border-purple-400/40 bg-purple-400/10 text-purple-400" },
  commodity: { icon: Gem,     label: "Commodities", activeClass: "border-amber-400 bg-amber-400/10 text-amber-400", badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-400" },
};

export default function Predictions() {
  const [assetClass, setAssetClass] = useState<AssetClass>("crypto");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTC");

  const { data: coins, isLoading: coinsLoading } = useListCoins({ assetType: assetClass });

  const { data: prediction, isLoading: predictionLoading } = useGetPrediction(selectedSymbol!, {
    query: {
      enabled: !!selectedSymbol,
      queryKey: getGetPredictionQueryKey(selectedSymbol!),
    },
  });

  const handleAssetClassChange = (cls: AssetClass) => {
    setAssetClass(cls);
    setSelectedSymbol(""); // reset until coins load
  };

  // Auto-select first coin when list changes
  const handleCoinsLoaded = (coinsList: typeof coins) => {
    if (coinsList && coinsList.length > 0 && !coinsList.find(c => c.symbol === selectedSymbol)) {
      setSelectedSymbol(coinsList[0].symbol);
    }
  };

  if (coins && !coins.find(c => c.symbol === selectedSymbol) && coins.length > 0 && selectedSymbol !== coins[0].symbol) {
    setSelectedSymbol(coins[0].symbol);
  }

  const meta = ASSET_CLASS_META[assetClass];
  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI Predictions</h1>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Asset class selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-muted-foreground" />
              Market &amp; Asset
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Market tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {(["crypto", "stock", "forex", "futures", "commodity"] as AssetClass[]).map((cls) => {
                const m = ASSET_CLASS_META[cls];
                const MIcon = m.icon;
                const active = assetClass === cls;
                return (
                  <button
                    key={cls}
                    onClick={() => handleAssetClassChange(cls)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                      active ? m.activeClass : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/20"
                    }`}
                  >
                    <MIcon className="w-5 h-5" />
                    {m.label}
                    {cls === "futures" && <span className="text-[10px] opacity-70 font-normal">10× leverage</span>}
                  </button>
                );
              })}
            </div>

            {/* Asset dropdown */}
            {coinsLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Select asset..." />
                </SelectTrigger>
                <SelectContent>
                  {coins?.map((coin) => (
                    <SelectItem key={coin.symbol} value={coin.symbol}>
                      <div className="flex items-center gap-3">
                        <CoinIcon symbol={coin.symbol} logoUrl={coin.logoUrl} className="w-5 h-5" />
                        <span className="font-medium">{coin.name}</span>
                        <span className="text-muted-foreground text-sm">({coin.symbol})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {assetClass === "futures" && (
              <p className="text-xs text-purple-400 bg-purple-400/10 border border-purple-400/30 rounded-lg px-3 py-2">
                ⚡ Futures predictions account for 10× leverage — Claude adjusts its confidence thresholds and reasoning accordingly.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Prediction result */}
        {predictionLoading ? (
          <Card className="bg-card border-primary/20">
            <CardContent className="p-4 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <div>
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
                <Skeleton className="h-10 w-32 rounded-full" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-6 w-5/6" />
              </div>
            </CardContent>
          </Card>
        ) : prediction ? (
          <Card className={`bg-card border-[1.5px] ${prediction.signal.includes("buy") ? "border-chart-2/30" : prediction.signal.includes("sell") ? "border-destructive/30" : "border-chart-4/30"}`}>
            <CardContent className="p-4 sm:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-8">
                <div className="flex items-center gap-5">
                  <div className="bg-muted p-3 rounded-2xl">
                    <BrainCircuit className="w-10 h-10 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Nexus AI Analysis</div>
                    <div className="flex items-center gap-2">
                      <div className="text-2xl sm:text-3xl font-bold">{prediction.symbol}</div>
                      <Badge variant="outline" className={`text-xs ${meta.badgeClass}`}>
                        <Icon className="w-3 h-3 mr-1" />{meta.label}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2">
                  <Badge className={`px-4 py-2 text-sm font-bold tracking-wider ${SIGNAL_COLORS[prediction.signal]}`}>
                    {SIGNAL_LABELS[prediction.signal]}
                  </Badge>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className="font-bold">{prediction.confidence}%</span>
                  </div>
                  <Progress value={prediction.confidence} className="w-32 h-1.5 mt-1" />
                </div>
              </div>

              <div className="py-8">
                <h3 className="text-lg font-semibold mb-4 text-foreground">AI Reasoning</h3>
                <p className="text-muted-foreground leading-relaxed text-lg">{prediction.reasoning}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-8 border-t border-border">
                <div className="bg-muted/50 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-background p-2 rounded-lg border border-border">
                      <Target className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Target Price</div>
                      <div className="font-bold text-xl">{formatCurrency(prediction.targetPrice)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Current</div>
                    <div className="font-medium">{formatCurrency(prediction.currentPrice)}</div>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-background p-2 rounded-lg border border-border">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Target Date</div>
                      <div className="font-bold text-xl">{format(new Date(prediction.targetDate), "MMM d, yyyy")}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>

              {assetClass === "futures" && (
                <div className="mt-6 p-4 bg-purple-400/10 border border-purple-400/30 rounded-xl">
                  <p className="text-xs text-purple-300">
                    <span className="font-bold">⚡ Leverage note:</span> With 10× leverage, a {Math.abs(((prediction.targetPrice - prediction.currentPrice) / prediction.currentPrice) * 100).toFixed(1)}% price move becomes a ~{Math.abs(((prediction.targetPrice - prediction.currentPrice) / prediction.currentPrice) * 100 * 10).toFixed(0)}% gain or loss on your margin. Manage risk accordingly.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : selectedSymbol ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <BrainCircuit className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Select an asset above to generate an AI prediction.</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
