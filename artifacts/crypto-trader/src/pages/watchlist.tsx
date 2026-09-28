import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListWatchlist, 
  useListCoins,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  getListWatchlistQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, CoinIcon } from "@/components/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Star, Bitcoin, BarChart2, Landmark, Zap, Gem } from "lucide-react";

type AssetClass = "crypto" | "stock" | "forex" | "futures" | "commodity";

const ASSET_META: Record<AssetClass, { icon: React.ElementType; label: string; badgeClass: string }> = {
  crypto:  { icon: Bitcoin,   label: "Crypto",  badgeClass: "border-orange-400/40 bg-orange-400/10 text-orange-400" },
  stock:   { icon: BarChart2, label: "Stock",   badgeClass: "border-blue-400/40 bg-blue-400/10 text-blue-400" },
  forex:   { icon: Landmark,  label: "Forex",   badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400" },
  futures: { icon: Zap,       label: "Futures", badgeClass: "border-purple-400/40 bg-purple-400/10 text-purple-400" },
  commodity: { icon: Gem,     label: "Commodity", badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-400" },
};

function guessAssetType(symbol: string, assetType?: string): AssetClass {
  if (assetType) return assetType as AssetClass;
  if (symbol.endsWith("-PERP") || symbol.endsWith("-FUT")) return "futures";
  const STOCKS = ["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","NFLX","AMD","JPM"];
  if (STOCKS.includes(symbol)) return "stock";
  const FOREX = ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","XAUUSD"];
  if (FOREX.includes(symbol)) return "forex";
  const COMMODITIES = ["WTI","BRENT","NATGAS","SILVER","COPPER","PLATINUM","WHEAT","CORN"];
  if (COMMODITIES.includes(symbol)) return "commodity";
  return "crypto";
}

function AssetBadge({ symbol, assetType }: { symbol: string; assetType?: string }) {
  const cls = guessAssetType(symbol, assetType);
  const m = ASSET_META[cls];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`text-[10px] py-0 h-4 ${m.badgeClass}`}>
      <Icon className="w-2.5 h-2.5 mr-0.5" />{m.label}
    </Badge>
  );
}

export default function Watchlist() {
  const [selectedCoinToAdd, setSelectedCoinToAdd] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: watchlist, isLoading: watchlistLoading } = useListWatchlist();
  // Load all asset types
  const { data: cryptoCoins } = useListCoins({ assetType: "crypto" });
  const { data: stockCoins } = useListCoins({ assetType: "stock" });
  const { data: forexCoins } = useListCoins({ assetType: "forex" });
  const { data: futuresCoins } = useListCoins({ assetType: "futures" });
  const { data: commodityCoins } = useListCoins({ assetType: "commodity" });

  const allCoins = [
    ...(cryptoCoins || []),
    ...(stockCoins || []),
    ...(forexCoins || []),
    ...(futuresCoins || []),
    ...(commodityCoins || []),
  ];

  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const handleAdd = () => {
    if (!selectedCoinToAdd) return;
    addToWatchlist.mutate({ data: { symbol: selectedCoinToAdd } }, {
      onSuccess: () => {
        toast({ title: "Added to Watchlist", description: `${selectedCoinToAdd} added.` });
        setSelectedCoinToAdd("");
        queryClient.invalidateQueries({ queryKey: getListWatchlistQueryKey() });
      },
      onError: (error) => {
        toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to add", variant: "destructive" });
      },
    });
  };

  const handleRemove = (symbol: string) => {
    removeFromWatchlist.mutate({ symbol }, {
      onSuccess: () => {
        toast({ title: "Removed", description: `${symbol} removed from watchlist.` });
        queryClient.invalidateQueries({ queryKey: getListWatchlistQueryKey() });
      },
      onError: (error) => {
        toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to remove", variant: "destructive" });
      },
    });
  };

  const watchlistSymbols = new Set(watchlist?.map((w) => w.symbol) || []);
  const availableToAdd = allCoins.filter((c) => !watchlistSymbols.has(c.symbol));

  // Group available coins by asset type for the dropdown
  const grouped: Record<AssetClass, typeof allCoins> = { crypto: [], stock: [], forex: [], futures: [], commodity: [] };
  for (const c of availableToAdd) {
    const cls = guessAssetType(c.symbol, (c as any).assetType);
    grouped[cls].push(c);
  }

  const groupLabels: Record<AssetClass, string> = {
    crypto: "— Crypto —",
    stock: "— Stocks —",
    forex: "— Forex —",
    futures: "— Futures (10×) —",
    commodity: "— Commodities —",
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Watchlist</h1>
      </div>

      <Card className="bg-card">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle>Your Saved Assets</CardTitle>
          <div className="flex items-center gap-2 max-w-sm w-full">
            <Select value={selectedCoinToAdd} onValueChange={setSelectedCoinToAdd}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Add asset from any market..." />
              </SelectTrigger>
              <SelectContent>
                {(["crypto", "stock", "forex", "futures", "commodity"] as AssetClass[]).map((cls) => {
                  const coins = grouped[cls];
                  if (!coins.length) return null;
                  return (
                    <div key={cls}>
                      <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground sticky top-0 bg-popover">
                        {groupLabels[cls]}
                      </div>
                      {coins.map((coin) => (
                        <SelectItem key={coin.symbol} value={coin.symbol}>
                          <div className="flex items-center gap-2">
                            <CoinIcon symbol={coin.symbol} logoUrl={coin.logoUrl} className="w-4 h-4" />
                            <span>{coin.name}</span>
                            <span className="text-muted-foreground text-xs">({coin.symbol})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  );
                })}
                {availableToAdd.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground text-center">All assets are in watchlist</div>
                )}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={!selectedCoinToAdd || addToWatchlist.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
              <Plus className="w-4 h-4 mr-2" />Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {watchlistLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !watchlist || watchlist.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">Your watchlist is empty</h3>
              <p className="text-muted-foreground">Add crypto, stocks, forex pairs, or futures to monitor them here.</p>
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">24h Change</TableHead>
                    <TableHead className="w-[100px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchlist.map((item) => {
                    const isPos = item.change24h >= 0;
                    return (
                      <TableRow key={item.symbol} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <CoinIcon symbol={item.symbol} logoUrl={item.logoUrl} className="w-8 h-8" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold">{item.symbol}</span>
                                <AssetBadge symbol={item.symbol} />
                              </div>
                              <div className="text-xs text-muted-foreground">{item.name}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          {formatCurrency(item.price)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={`font-bold ${isPos ? "text-chart-2" : "text-destructive"}`}>
                            {formatPercent(item.change24h)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemove(item.symbol)}
                            disabled={removeFromWatchlist.isPending}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
