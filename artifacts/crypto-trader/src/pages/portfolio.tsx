import { useGetPortfolio } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, CoinIcon } from "@/components/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, TrendingUp, TrendingDown, PieChart, Bitcoin, BarChart2, Landmark, Zap, Gem } from "lucide-react";

type AssetClass = "crypto" | "stock" | "forex" | "futures" | "commodity";

const ASSET_META: Record<AssetClass, { icon: React.ElementType; label: string; badgeClass: string }> = {
  crypto:  { icon: Bitcoin,   label: "Crypto",  badgeClass: "border-orange-400/40 bg-orange-400/10 text-orange-400" },
  stock:   { icon: BarChart2, label: "Stock",   badgeClass: "border-blue-400/40 bg-blue-400/10 text-blue-400" },
  forex:   { icon: Landmark,  label: "Forex",   badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400" },
  futures: { icon: Zap,       label: "Futures", badgeClass: "border-purple-400/40 bg-purple-400/10 text-purple-400" },
  commodity: { icon: Gem,     label: "Commodity", badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-400" },
};

const STOCKS = new Set(["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","NFLX","AMD","JPM"]);
const FOREX  = new Set(["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","XAUUSD"]);
const COMMODITIES = new Set(["WTI","BRENT","NATGAS","SILVER","COPPER","PLATINUM","WHEAT","CORN"]);

function guessAssetType(symbol: string): AssetClass {
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

export default function Portfolio() {
  const { data: portfolio, isLoading } = useGetPortfolio();

  if (isLoading || !portfolio) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Portfolio</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full mt-6" />
      </div>
    );
  }

  const isTotalPositive = portfolio.totalPnl >= 0;

  // Group holdings by asset class for summary badges
  const classCounts: Partial<Record<AssetClass, number>> = {};
  for (const h of portfolio.holdings) {
    const cls = guessAssetType(h.symbol);
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Portfolio</h1>
        {portfolio.holdings.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.entries(classCounts) as [AssetClass, number][]).map(([cls, count]) => {
              const m = ASSET_META[cls];
              const Icon = m.icon;
              return (
                <Badge key={cls} variant="outline" className={`gap-1 ${m.badgeClass}`}>
                  <Icon className="w-3 h-3" />{count} {m.label}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(portfolio.totalValue)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invested</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(portfolio.totalInvested)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Cash</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(portfolio.usdBalance)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total P&amp;L</CardTitle>
            {isTotalPositive ? <TrendingUp className="h-4 w-4 text-chart-2" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isTotalPositive ? "text-chart-2" : "text-destructive"}`}>
              {formatCurrency(portfolio.totalPnl)}
            </div>
            <div className={`text-sm ${isTotalPositive ? "text-chart-2/80" : "text-destructive/80"}`}>
              {formatPercent(portfolio.totalPnlPercent)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card mt-6">
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {portfolio.holdings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {!portfolio.alpacaConnected && !portfolio.oandaConnected
                ? "No broker connected. Link your Alpaca or OANDA account in Account → Connections to see your real holdings."
                : "No open positions in your linked broker accounts yet."}
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">P&amp;L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {portfolio.holdings.map((holding) => {
                    const isPos = holding.pnl >= 0;
                    const isFutures = guessAssetType(holding.symbol) === "futures";
                    return (
                      <TableRow key={holding.symbol} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <CoinIcon symbol={holding.symbol} logoUrl={holding.logoUrl} className="w-8 h-8" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold">{holding.symbol}</span>
                                <AssetBadge symbol={holding.symbol} />
                              </div>
                              <div className="text-xs text-muted-foreground">{holding.name}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(holding.avgBuyPrice)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(holding.currentPrice)}
                          {isFutures && <div className="text-[10px] text-purple-400">10× margin</div>}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(holding.currentValue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={`font-bold ${isPos ? "text-chart-2" : "text-destructive"}`}>
                            {formatCurrency(holding.pnl)}
                          </div>
                          <div className={`text-xs ${isPos ? "text-chart-2/80" : "text-destructive/80"}`}>
                            {formatPercent(holding.pnlPercent)}
                            {isFutures && <span className="text-purple-400 ml-1">({formatPercent(holding.pnlPercent * 10)} eff.)</span>}
                          </div>
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
