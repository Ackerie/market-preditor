import { useState } from "react";
import { useListTrades } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, CoinIcon } from "@/components/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Bitcoin, BarChart2, Landmark, Zap, Gem, Filter } from "lucide-react";

type AssetClass = "all" | "crypto" | "stock" | "forex" | "futures" | "commodity";

const ASSET_META: Record<string, { icon: React.ElementType; label: string; badgeClass: string }> = {
  crypto:  { icon: Bitcoin,   label: "Crypto",  badgeClass: "border-orange-400/40 bg-orange-400/10 text-orange-400" },
  stock:   { icon: BarChart2, label: "Stock",   badgeClass: "border-blue-400/40 bg-blue-400/10 text-blue-400" },
  forex:   { icon: Landmark,  label: "Forex",   badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400" },
  futures: { icon: Zap,       label: "Futures", badgeClass: "border-purple-400/40 bg-purple-400/10 text-purple-400" },
  commodity: { icon: Gem,     label: "Commodity", badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-400" },
};

const STOCKS = new Set(["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","NFLX","AMD","JPM"]);
const FOREX  = new Set(["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","XAUUSD"]);
const COMMODITIES = new Set(["WTI","BRENT","NATGAS","SILVER","COPPER","PLATINUM","WHEAT","CORN"]);

function guessAssetType(symbol: string): string {
  if (symbol.endsWith("-PERP") || symbol.endsWith("-FUT")) return "futures";
  if (STOCKS.has(symbol)) return "stock";
  if (FOREX.has(symbol))  return "forex";
  if (COMMODITIES.has(symbol)) return "commodity";
  return "crypto";
}

function AssetBadge({ symbol }: { symbol: string }) {
  const cls = guessAssetType(symbol);
  const m = ASSET_META[cls];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`text-[10px] py-0 h-4 ${m.badgeClass}`}>
      <Icon className="w-2.5 h-2.5 mr-0.5" />{m.label}
    </Badge>
  );
}

const FILTER_TABS: { value: AssetClass; label: string; icon?: React.ElementType }[] = [
  { value: "all",     label: "All" },
  { value: "crypto",  label: "Crypto",  icon: Bitcoin },
  { value: "stock",   label: "Stocks",  icon: BarChart2 },
  { value: "forex",   label: "Forex",   icon: Landmark },
  { value: "futures", label: "Futures", icon: Zap },
  { value: "commodity", label: "Commodities", icon: Gem },
];

export default function History() {
  const { data: trades, isLoading } = useListTrades();
  const [filter, setFilter] = useState<AssetClass>("all");

  if (isLoading || !trades) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Trade History</h1>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  const filteredTrades = filter === "all"
    ? trades
    : trades.filter((t) => guessAssetType(t.symbol) === filter);

  // Counts per class
  const counts: Partial<Record<string, number>> = {};
  for (const t of trades) {
    const cls = guessAssetType(t.symbol);
    counts[cls] = (counts[cls] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Trade History</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span className="font-medium">{filteredTrades.length}</span> of <span className="font-medium">{trades.length}</span> trades
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.value;
          const Icon = tab.icon;
          const count = tab.value === "all" ? trades.length : (counts[tab.value] || 0);
          if (tab.value !== "all" && count === 0) return null;
          return (
            <button key={tab.value} onClick={() => setFilter(tab.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground bg-muted/20"
              }`}>
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>
            {filter === "all" ? "All Executed Trades" : `${FILTER_TABS.find(t => t.value === filter)?.label} Trades`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No {filter === "all" ? "" : filter + " "}trades found.
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Time</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.map((trade) => (
                    <TableRow key={trade.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                        {format(new Date(trade.createdAt), "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={trade.symbol} logoUrl={trade.logoUrl} className="w-6 h-6" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">{trade.symbol}</span>
                              <AssetBadge symbol={trade.symbol} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline"
                          className={trade.side === "buy" ? "bg-chart-2/20 text-chart-2 border-chart-2/50" : "bg-destructive/20 text-destructive border-destructive/50"}>
                          {trade.side.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(trade.price)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {trade.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {formatCurrency(trade.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
