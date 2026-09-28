import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListCoins, 
  useGetCoin, 
  getGetCoinQueryKey, 
  usePlaceTrade,
  getGetPortfolioQueryKey,
  getListTradesQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, CoinIcon } from "@/components/shared";
import { InteractiveMarketChart } from "@/components/interactive-market-chart";

const ASSET_TYPES = [
  { value: "crypto" as const, label: "Crypto" },
  { value: "stock" as const, label: "Stocks" },
  { value: "forex" as const, label: "Forex" },
  { value: "futures" as const, label: "Futures 10×" },
  { value: "commodity" as const, label: "Commodities" },
];

const VALID_TYPES = ["crypto", "stock", "forex", "futures", "commodity"] as const;
type TradeAssetType = (typeof VALID_TYPES)[number];

export default function Trade() {
  const initialParams = new URLSearchParams(window.location.search);
  const rawType = initialParams.get("type");
  const initialType: TradeAssetType = VALID_TYPES.includes(rawType as TradeAssetType) ? (rawType as TradeAssetType) : "crypto";
  const initialSymbol = initialParams.get("symbol") || (initialType === "crypto" ? "BTC" : "");

  const [assetType, setAssetType] = useState<TradeAssetType>(initialType);
  const [selectedCoin, setSelectedCoin] = useState<string>(initialSymbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [notional, setNotional] = useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: coins, isLoading: coinsLoading } = useListCoins({ assetType });

  useEffect(() => {
    if (coins && coins.length > 0) {
      const coinExists = coins.find((c) => c.symbol === selectedCoin);
      if (!coinExists) {
        setSelectedCoin(coins[0].symbol);
      }
    }
  }, [coins, selectedCoin]);

  const { data: coinDetail, isLoading: coinDetailLoading } = useGetCoin(selectedCoin!, {
    query: {
      enabled: !!selectedCoin,
      queryKey: getGetCoinQueryKey(selectedCoin!),
      refetchInterval: 5000,
    }
  });

  const placeTrade = usePlaceTrade();

  const handleTrade = () => {
    if (!selectedCoin || !notional || isNaN(Number(notional)) || Number(notional) < 1) return;

    placeTrade.mutate({
      data: {
        symbol: selectedCoin,
        side,
        notional: Number(notional)
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Order Placed",
          description: `${side === 'buy' ? 'Buy' : 'Sell'} order for $${Number(notional).toFixed(2)} of ${selectedCoin} sent to your broker`,
        });
        setNotional("");
        queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
      },
      onError: (error: any) => {
        toast({
          title: "Trade Failed",
          description: error?.response?.data?.error ?? (error instanceof Error ? error.message : "Failed to execute trade"),
          variant: "destructive"
        });
      }
    });
  };

  const estimatedQty = coinDetail && coinDetail.price > 0 ? Number(notional) / coinDetail.price : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Trade</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Chart & Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-3">
                {coinsLoading || coinDetailLoading ? (
                  <Skeleton className="w-12 h-12 rounded-full" />
                ) : (
                  coinDetail && <CoinIcon symbol={coinDetail.symbol} logoUrl={coinDetail.logoUrl} className="w-12 h-12" />
                )}
                <div>
                  <CardTitle className="text-xl leading-tight">
                    {coinDetailLoading ? <Skeleton className="h-6 w-32" /> : coinDetail?.name}
                  </CardTitle>
                  <div className="text-sm text-muted-foreground font-medium">
                    {coinDetailLoading ? <Skeleton className="h-4 w-14 mt-1" /> : coinDetail?.symbol}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-bold font-mono">
                  {coinDetailLoading ? <Skeleton className="h-9 w-36" /> : coinDetail && formatCurrency(coinDetail.price)}
                </div>
                {coinDetailLoading ? (
                  <Skeleton className="h-5 w-16 mt-1 ml-auto" />
                ) : coinDetail && (
                  <div className={`text-sm font-semibold mt-0.5 ${coinDetail.change24h >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {coinDetail.change24h >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(coinDetail.change24h))} today
                  </div>
                )}
              </div>
            </CardHeader>

            {/* Stats strip */}
            {coinDetail && !coinDetailLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border border-y border-border bg-muted/30 px-0">
                <div className="px-4 py-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">24h High</div>
                  <div className="text-sm font-mono font-semibold text-emerald-500">{formatCurrency(coinDetail.high24h)}</div>
                </div>
                <div className="px-4 py-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">24h Low</div>
                  <div className="text-sm font-mono font-semibold text-red-500">{formatCurrency(coinDetail.low24h)}</div>
                </div>
                <div className="px-4 py-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Volume</div>
                  <div className="text-sm font-mono font-semibold">
                    {coinDetail.volume >= 1e9
                      ? `$${(coinDetail.volume / 1e9).toFixed(2)}B`
                      : coinDetail.volume >= 1e6
                      ? `$${(coinDetail.volume / 1e6).toFixed(1)}M`
                      : `$${(coinDetail.volume / 1e3).toFixed(0)}K`}
                  </div>
                </div>
                <div className="px-4 py-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Market Cap</div>
                  <div className="text-sm font-mono font-semibold">
                    {coinDetail.marketCap >= 1e12
                      ? `$${(coinDetail.marketCap / 1e12).toFixed(2)}T`
                      : coinDetail.marketCap >= 1e9
                      ? `$${(coinDetail.marketCap / 1e9).toFixed(1)}B`
                      : `$${(coinDetail.marketCap / 1e6).toFixed(0)}M`}
                  </div>
                </div>
              </div>
            )}

            <CardContent className="p-0">
              <div className="w-full px-1 pb-3">
                {coinDetailLoading || !coinDetail ? (
                  <Skeleton className="w-full h-[340px] rounded-none" />
                ) : (
                  <InteractiveMarketChart symbol={selectedCoin} height={340} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Trade Form */}
        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Place Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Asset Type</Label>
                <div className="flex p-1 bg-muted rounded-lg w-full sm:w-fit">
                  {ASSET_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setAssetType(t.value)}
                      className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                        assetType === t.value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Asset</Label>
                {coinsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedCoin} onValueChange={setSelectedCoin}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select coin" />
                    </SelectTrigger>
                    <SelectContent>
                      {coins?.map(coin => (
                        <SelectItem key={coin.symbol} value={coin.symbol}>
                          <div className="flex items-center gap-2">
                            <CoinIcon symbol={coin.symbol} logoUrl={coin.logoUrl} className="w-4 h-4" />
                            <span>{coin.name} ({coin.symbol})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex p-1 bg-muted rounded-lg">
                <button
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${side === 'buy' ? 'bg-chart-2 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setSide('buy')}
                >
                  Buy
                </button>
                <button
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${side === 'sell' ? 'bg-destructive text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setSide('sell')}
                >
                  Sell
                </button>
              </div>

              <div className="space-y-2">
                <Label>Amount (USD)</Label>
                <div className="relative">
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    min={1}
                    value={notional}
                    onChange={(e) => setNotional(e.target.value)}
                    className="pr-16"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                    USD
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Market order, executed on your linked broker account. Minimum $1.</p>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Price</span>
                  <span className="font-medium">
                    {coinDetailLoading ? <Skeleton className="h-4 w-16" /> : coinDetail && formatCurrency(coinDetail.price)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Quantity</span>
                  <span className="font-medium text-lg text-foreground">
                    {!Number.isFinite(estimatedQty) || estimatedQty <= 0 ? "0" : `≈ ${estimatedQty.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${selectedCoin}`}
                  </span>
                </div>
              </div>

              <Button 
                className={`w-full text-white font-bold h-12 text-lg ${side === 'buy' ? 'bg-chart-2 hover:bg-chart-2/90' : 'bg-destructive hover:bg-destructive/90'}`}
                onClick={handleTrade}
                disabled={!notional || Number(notional) < 1 || placeTrade.isPending}
              >
                {placeTrade.isPending ? "Processing..." : `${side === 'buy' ? 'Buy' : 'Sell'} ${selectedCoin}`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
