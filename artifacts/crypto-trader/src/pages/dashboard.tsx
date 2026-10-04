import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useGetMarketSummary,
  useListCoins,
  getListCoinsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent, CoinIcon } from "@/components/shared";
import {
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DollarSign,
  Wallet,
  Bitcoin,
  BarChart2,
  Landmark,
  Zap,
  Gem,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Globe,
} from "lucide-react";

type AssetClass = "crypto" | "stock" | "forex" | "futures" | "commodity";
type TabValue = "all" | AssetClass;
type SortKey = "name" | "price" | "change24h" | "volume" | "marketCap";

const CLASS_META: Record<
  AssetClass,
  { icon: React.ElementType; label: string; badgeClass: string }
> = {
  crypto: {
    icon: Bitcoin,
    label: "Crypto",
    badgeClass: "border-orange-400/40 bg-orange-400/10 text-orange-400",
  },
  stock: {
    icon: BarChart2,
    label: "Stock",
    badgeClass: "border-blue-400/40 bg-blue-400/10 text-blue-400",
  },
  forex: {
    icon: Landmark,
    label: "Forex",
    badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
  },
  futures: {
    icon: Zap,
    label: "Futures",
    badgeClass: "border-purple-400/40 bg-purple-400/10 text-purple-400",
  },
  commodity: {
    icon: Gem,
    label: "Commodity",
    badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  },
};

const TABS: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All Markets", icon: Globe },
  { value: "crypto", label: "Crypto", icon: Bitcoin },
  { value: "stock", label: "Stocks", icon: BarChart2 },
  { value: "forex", label: "Forex", icon: Landmark },
  { value: "futures", label: "Futures", icon: Zap },
  { value: "commodity", label: "Commodities", icon: Gem },
];

function formatVolume(v: number): string {
  if (!v) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toString();
}

function formatMarketCap(v: number): string {
  if (!v) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return formatCurrency(v);
}

function MarketsTable() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("change24h");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: coins, isLoading } = useListCoins(undefined, {
    query: { queryKey: getListCoinsQueryKey(), refetchInterval: 10000 },
  });

  const rows = useMemo(() => {
    let list = coins || [];
    if (tab !== "all") list = list.filter((c) => c.assetType === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.symbol.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
    });
  }, [coins, tab, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortHeader = ({
    label,
    k,
    className = "",
  }: {
    label: string;
    k: SortKey;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Live Markets
            <span className="text-xs font-normal text-muted-foreground">
              updates every 10s
            </span>
          </CardTitle>
          <div className="relative w-full lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              aria-label="Search assets"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear asset search"
                title="Clear asset search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {TABS.map((t) => {
            const TIcon = t.icon;
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                <TIcon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHeader label="Asset" k="name" />
                  <TableHead>Class</TableHead>
                  <SortHeader label="Price" k="price" className="text-right" />
                  <SortHeader
                    label="24h %"
                    k="change24h"
                    className="text-right"
                  />
                  <TableHead className="text-right hidden md:table-cell">
                    24h High
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell">
                    24h Low
                  </TableHead>
                  <SortHeader
                    label="Volume"
                    k="volume"
                    className="text-right hidden lg:table-cell"
                  />
                  <SortHeader
                    label="Mkt Cap"
                    k="marketCap"
                    className="text-right hidden lg:table-cell"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      No assets match your search
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((c) => {
                    const cls = (c.assetType || "crypto") as AssetClass;
                    const meta = CLASS_META[cls] || CLASS_META.crypto;
                    const MIcon = meta.icon;
                    const up = c.change24h >= 0;
                    return (
                      <TableRow
                        key={c.symbol}
                        className="cursor-pointer"
                        onClick={() =>
                          setLocation(
                            `/trade?symbol=${encodeURIComponent(c.symbol)}&type=${cls}`,
                          )
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <CoinIcon
                              symbol={c.symbol}
                              logoUrl={c.logoUrl}
                              className="w-8 h-8"
                            />
                            <div>
                              <div className="font-semibold">{c.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {c.symbol}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`gap-1 ${meta.badgeClass}`}
                          >
                            <MIcon className="w-3 h-3" /> {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(c.price)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${up ? "text-chart-2" : "text-destructive"}`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {up ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {formatPercent(Math.abs(c.change24h))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm hidden md:table-cell text-emerald-500/90">
                          {formatCurrency(c.price * 1.04)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm hidden md:table-cell text-red-500/90">
                          {formatCurrency(c.price * 0.96)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm hidden lg:table-cell">
                          {formatVolume(c.volume)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm hidden lg:table-cell">
                          {formatMarketCap(c.marketCap)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="text-xs text-muted-foreground pt-3">
          Click any asset to trade it. Sort by clicking column headers.
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetMarketSummary();

  if (isLoading || !summary) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Dashboard
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const isPositive = summary.portfolioChange24h >= 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Dashboard
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Portfolio Value
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(summary.portfolioValue)}
            </div>
            <div
              className={`flex items-center text-sm mt-1 ${isPositive ? "text-chart-2" : "text-destructive"}`}
            >
              {isPositive ? (
                <ArrowUpRight className="h-4 w-4 mr-1" />
              ) : (
                <ArrowDownRight className="h-4 w-4 mr-1" />
              )}
              {formatPercent(summary.portfolioChange24hPercent)}
              <span className="text-muted-foreground ml-2">24h</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Available USD
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(summary.usdBalance)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Ready for trading
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fear & Greed Index
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div
                className="text-3xl font-bold"
                style={{
                  color:
                    summary.fearGreedIndex < 40
                      ? "var(--color-destructive)"
                      : summary.fearGreedIndex > 60
                        ? "var(--color-chart-2)"
                        : "var(--color-chart-4)",
                }}
              >
                {summary.fearGreedIndex}
              </div>
              <div className="text-sm font-medium text-muted-foreground pb-1">
                {summary.fearGreedLabel}
              </div>
            </div>
            <div className="h-2 w-full bg-muted rounded-full mt-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${summary.fearGreedIndex}%`,
                  backgroundColor:
                    summary.fearGreedIndex < 40
                      ? "var(--color-destructive)"
                      : summary.fearGreedIndex > 60
                        ? "var(--color-chart-2)"
                        : "var(--color-chart-4)",
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <MarketsTable />
    </div>
  );
}
