import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBrokerStatus,
  getGetBrokerStatusQueryKey,
  useConnectBroker,
  useDisconnectBroker,
  useListBrokerPositions,
  getListBrokerPositionsQueryKey,
  useListBrokerOrders,
  getListBrokerOrdersQueryKey,
  usePlaceBrokerOrder,
  useGetBrokerAutoTradeSettings,
  getGetBrokerAutoTradeSettingsQueryKey,
  useUpdateBrokerAutoTradeSettings,
  useGetOandaStatus,
  getGetOandaStatusQueryKey,
  useConnectOanda,
  useDisconnectOanda,
  useGetOandaAutoTradeSettings,
  getGetOandaAutoTradeSettingsQueryKey,
  useUpdateOandaAutoTradeSettings,
  useGetKrakenStatus,
  getGetKrakenStatusQueryKey,
  useGetKrakenAutoTradeSettings,
  getGetKrakenAutoTradeSettingsQueryKey,
  useUpdateKrakenAutoTradeSettings,
  useConnectKraken,
  useDisconnectKraken,
  getGetPortfolioQueryKey,
  type BrokerStatus,
  type OandaStatus,
  type KrakenStatus,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/components/shared";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  Banknote,
  Link2,
  Unlink,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Bot,
  Landmark,
  ExternalLink,
  Coins,
} from "lucide-react";
import {
  AutoTradeAlertBanner,
  AutoTradeActivityFeed,
} from "@/components/auto-trade-alerts";

function ConnectForm() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const connect = useConnectBroker();

  const handleConnect = () => {
    if (!apiKey.trim() || !apiSecret.trim()) return;
    connect.mutate(
      { data: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), mode } },
      {
        onSuccess: () => {
          toast({
            title: "Broker connected",
            description: `Your Alpaca ${mode} account is now linked.`,
          });
          queryClient.invalidateQueries({
            queryKey: getGetBrokerStatusQueryKey(),
          });
        },
        onError: (error) => {
          toast({
            title: "Connection failed",
            description:
              error instanceof Error
                ? error.message
                : "Could not connect to Alpaca",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" /> Connect your Alpaca account
          </CardTitle>
          <CardDescription>
            Trade stocks and crypto with your own brokerage account. Create a
            free account at{" "}
            <a
              href="https://alpaca.markets"
              target="_blank"
              rel="noreferrer"
              className="underline text-primary"
            >
              alpaca.markets
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Select Paper or Live below, then open the matching{" "}
              <a
                href={
                  mode === "paper"
                    ? "https://app.alpaca.markets/paper/dashboard/overview"
                    : "https://app.alpaca.markets/brokerage/dashboard/overview"
                }
                target="_blank"
                rel="noreferrer"
                className="underline text-primary"
              >
                Alpaca dashboard
              </a>
              .
            </li>
            <li>
              Open API Keys, generate a key pair, and copy the Key ID and
              Secret.
            </li>
            <li>
              Paste both values below. Paper keys only work with Paper mode;
              Live keys place real orders.
            </li>
          </ol>
          <div className="flex p-1 bg-muted rounded-lg w-fit">
            {(["paper", "live"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "paper" ? "Paper (practice)" : "Live (real money)"}
              </button>
            ))}
          </div>
          {mode === "live" && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              Live mode places orders with real money in your Alpaca account.
              Start small.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="alpaca-key">API Key ID</Label>
            <Input
              id="alpaca-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="PK..."
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alpaca-secret">API Secret</Label>
            <Input
              id="alpaca-secret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Your Alpaca secret key"
              autoComplete="off"
            />
          </div>
          <Button
            onClick={handleConnect}
            disabled={connect.isPending || !apiKey.trim() || !apiSecret.trim()}
            className="w-full"
          >
            {connect.isPending ? "Verifying with Alpaca..." : "Connect account"}
          </Button>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Keys are verified with
            Alpaca before saving and are never shown again in full.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RealMoney() {
  const { data: status, isLoading } = useGetBrokerStatus({
    query: { queryKey: getGetBrokerStatusQueryKey(), refetchInterval: 15000 },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <AutoTradeAlertBanner />
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">
          Alpaca — stocks &amp; crypto
        </h2>
        {!status?.connected ? (
          <ConnectForm />
        ) : (
          <BrokerDashboard status={status} />
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">
          OANDA — forex &amp; commodities
        </h2>
        <OandaSection />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">
          Kraken — crypto spot
        </h2>
        <KrakenSection />
      </section>
      <section className="space-y-4">
        <AutoTradeActivityFeed />
      </section>
    </div>
  );
}

function OandaSection() {
  const { data: status, isLoading } = useGetOandaStatus({
    query: { queryKey: getGetOandaStatusQueryKey(), refetchInterval: 15000 },
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!status?.connected) {
    return <OandaConnectForm />;
  }

  return <OandaDashboard status={status} />;
}

function KrakenSection() {
  const { data: status, isLoading } = useGetKrakenStatus({
    query: { queryKey: getGetKrakenStatusQueryKey(), refetchInterval: 15000 },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  return status?.connected ? (
    <KrakenDashboard status={status} />
  ) : (
    <KrakenConnectForm />
  );
}

function KrakenConnectForm() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const connect = useConnectKraken();

  const handleConnect = () => {
    if (!apiKey.trim() || !apiSecret.trim()) return;
    connect.mutate(
      { data: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() } },
      {
        onSuccess: () => {
          toast({
            title: "Kraken connected",
            description:
              "Your Kraken Spot account is now linked for manual crypto trading.",
          });
          queryClient.invalidateQueries({
            queryKey: getGetKrakenStatusQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetPortfolioQueryKey(),
          });
        },
        onError: (error) =>
          toast({
            title: "Connection failed",
            description:
              error instanceof Error
                ? error.message
                : "Could not verify your Kraken API credentials.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5" /> Connect your Kraken account
          </CardTitle>
          <CardDescription>
            Link Kraken Spot to view crypto balances and place manual market
            orders. Create an API key from your Kraken account’s API settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            This connection can place live orders. Do not grant withdrawal
            permissions. AI auto-trading is not enabled for Kraken.
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              In{" "}
              <a
                href="https://pro.kraken.com"
                target="_blank"
                rel="noreferrer"
                className="underline text-primary"
              >
                Kraken Pro
              </a>
              , open your profile menu, then Settings → API → Create API key.
            </li>
            <li>
              Enable Query Funds, Query Closed Orders &amp; Trades, and Modify
              Orders. Leave Withdraw Funds disabled.
            </li>
            <li>
              Copy the API key and private key when Kraken displays them, then
              paste them below.
            </li>
          </ol>
          <div className="space-y-2">
            <Label htmlFor="kraken-key">API Key</Label>
            <Input
              id="kraken-key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kraken-secret">Private API Key</Label>
            <Input
              id="kraken-secret"
              type="password"
              value={apiSecret}
              onChange={(event) => setApiSecret(event.target.value)}
              autoComplete="off"
            />
          </div>
          <Button
            onClick={handleConnect}
            disabled={connect.isPending || !apiKey.trim() || !apiSecret.trim()}
            className="w-full"
          >
            {connect.isPending ? "Verifying with Kraken..." : "Connect Kraken"}
          </Button>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Kraken verifies the key with
            a balance request. Credentials are encrypted at rest and never shown
            again in full.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function KrakenDashboard({ status }: { status: KrakenStatus }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const disconnect = useDisconnectKraken();

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Kraken disconnected" });
        queryClient.invalidateQueries({
          queryKey: getGetKrakenStatusQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="uppercase">
            Live · Kraken Spot
          </Badge>
          {status.apiKeyMasked && (
            <span className="text-xs text-muted-foreground font-mono">
              {status.apiKeyMasked}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnect.isPending}
        >
          <Unlink className="w-4 h-4 mr-1.5" /> Disconnect
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">USD cash</p>
            <p className="text-2xl font-bold">
              {formatCurrency(status.cash ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Crypto equity</p>
            <p className="text-2xl font-bold">
              {formatCurrency(status.equity ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Kraken Spot supports crypto and eligible xStocks for manual and AI
        market orders.
      </p>
      <KrakenAutoTradeCard />
    </div>
  );
}

function KrakenAutoTradeCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetKrakenAutoTradeSettings({
    query: { queryKey: getGetKrakenAutoTradeSettingsQueryKey() },
  });
  const update = useUpdateKrakenAutoTradeSettings();
  const [maxPerTrade, setMaxPerTrade] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState<string | null>(null);

  const maxValue =
    maxPerTrade ?? (settings ? String(settings.maxPerTradeUsd) : "");
  const dailyValue =
    dailyLimit ?? (settings ? String(settings.dailyLimitUsd) : "");

  const save = (data: {
    enabled?: boolean;
    maxPerTradeUsd?: number;
    dailyLimitUsd?: number;
  }) => {
    update.mutate(
      { data },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({
            queryKey: getGetKrakenAutoTradeSettingsQueryKey(),
          });
          toast({
            title:
              data.enabled === undefined
                ? "Kraken AI limits saved"
                : updated.enabled
                  ? "Kraken AI auto-trading enabled"
                  : "Kraken AI auto-trading disabled",
            description:
              data.enabled && updated.enabled
                ? `AI may place Kraken Spot orders up to ${formatCurrency(updated.maxPerTradeUsd)} per trade and ${formatCurrency(updated.dailyLimitUsd)} per day.`
                : undefined,
          });
        },
        onError: (error: any) =>
          toast({
            title: "Could not save Kraken settings",
            description:
              error?.response?.data?.error ??
              (error instanceof Error ? error.message : "Please try again"),
            variant: "destructive",
          }),
      },
    );
  };

  const saveLimits = () => {
    const max = Number(maxValue);
    const daily = Number(dailyValue);
    if (
      !Number.isFinite(max) ||
      max < 1 ||
      !Number.isFinite(daily) ||
      daily < 1
    )
      return;
    save({ maxPerTradeUsd: max, dailyLimitUsd: daily });
  };

  if (isLoading || !settings) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5" /> AI Auto-Trader (Kraken Spot)
          </CardTitle>
          <Switch
            checked={settings.enabled}
            disabled={update.isPending}
            onCheckedChange={(checked) => save({ enabled: checked })}
          />
        </div>
        <CardDescription>
          When enabled, AI may submit live Kraken Spot crypto and eligible
          xStock orders on this account, within the limits below. Futures use
          separate credentials and controls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.enabled && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            AI will place real orders. Keep the per-trade and daily limits
            conservative; Kraken withdrawals are not used.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="kraken-auto-max">Max per trade (USD)</Label>
            <Input
              id="kraken-auto-max"
              type="number"
              min={1}
              value={maxValue}
              onChange={(event) => setMaxPerTrade(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kraken-auto-daily">Daily limit (USD)</Label>
            <Input
              id="kraken-auto-daily"
              type="number"
              min={1}
              value={dailyValue}
              onChange={(event) => setDailyLimit(event.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Used today:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(settings.spentTodayUsd)}
            </span>{" "}
            of {formatCurrency(settings.dailyLimitUsd)}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={saveLimits}
            disabled={
              update.isPending || (maxPerTrade === null && dailyLimit === null)
            }
          >
            Save limits
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OandaConnectForm() {
  const [apiToken, setApiToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [mode, setMode] = useState<"practice" | "live">("practice");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const connect = useConnectOanda();

  const handleConnect = () => {
    if (!apiToken.trim() || !accountId.trim()) return;
    connect.mutate(
      {
        data: { apiToken: apiToken.trim(), accountId: accountId.trim(), mode },
      },
      {
        onSuccess: () => {
          toast({
            title: "OANDA connected",
            description: `Your OANDA ${mode} account is now linked.`,
          });
          queryClient.invalidateQueries({
            queryKey: getGetOandaStatusQueryKey(),
          });
        },
        onError: (error: any) => {
          toast({
            title: "Connection failed",
            description:
              error?.response?.data?.error ??
              (error instanceof Error
                ? error.message
                : "Could not connect to OANDA"),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" /> Connect your OANDA account
          </CardTitle>
          <CardDescription>
            Trade forex, commodities, and index CFDs with your OANDA v20
            account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Sign in to the OANDA{" "}
              <a
                href="https://www.oanda.com/account/tpa/personal_token"
                target="_blank"
                rel="noreferrer"
                className="underline text-primary"
              >
                Account Management Portal
              </a>
              .
            </li>
            <li>
              Under My Services, open Manage API Access and generate a personal
              access token.
            </li>
            <li>
              Copy the token and your account ID from fxTrade, then select the
              matching Practice or Live mode below.
            </li>
          </ol>
          <div className="flex p-1 bg-muted rounded-lg w-fit">
            {(["practice", "live"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "practice"
                  ? "Practice (fxTrade demo)"
                  : "Live (real money)"}
              </button>
            ))}
          </div>
          {mode === "live" && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              Live mode places orders with real money in your OANDA account.
              Leveraged CFDs can lose money quickly — start small.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="oanda-token">API Token</Label>
            <Input
              id="oanda-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Your OANDA personal access token"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oanda-account">Account ID</Label>
            <Input
              id="oanda-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="101-001-1234567-001"
              autoComplete="off"
            />
          </div>
          <Button
            onClick={handleConnect}
            disabled={
              connect.isPending || !apiToken.trim() || !accountId.trim()
            }
            className="w-full"
          >
            {connect.isPending ? "Verifying with OANDA..." : "Connect account"}
          </Button>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> The token is verified with
            OANDA before saving, encrypted at rest, and never shown again.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function OandaDashboard({ status }: { status: OandaStatus }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const disconnect = useDisconnectOanda();

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "OANDA disconnected" });
        queryClient.invalidateQueries({
          queryKey: getGetOandaStatusQueryKey(),
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge
            variant={status.mode === "live" ? "destructive" : "secondary"}
            className="uppercase"
          >
            {status.mode === "live" ? "Live · Real Money" : "Practice Account"}
          </Badge>
          {status.accountIdMasked && (
            <span className="text-xs text-muted-foreground font-mono">
              {status.accountIdMasked}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnect.isPending}
        >
          <Unlink className="w-4 h-4 mr-1.5" /> Disconnect
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Balance", value: status.balance },
          { label: "NAV", value: status.nav },
          { label: "Unrealized P&L", value: status.unrealizedPl },
          { label: "Margin Available", value: status.marginAvailable },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">
                {formatCurrency(s.value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <OandaAutoTradeCard mode={status.mode ?? "practice"} />
    </div>
  );
}

function OandaAutoTradeCard({ mode }: { mode: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetOandaAutoTradeSettings({
    query: { queryKey: getGetOandaAutoTradeSettingsQueryKey() },
  });
  const update = useUpdateOandaAutoTradeSettings();

  const [maxPerTrade, setMaxPerTrade] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState<string | null>(null);

  const maxValue =
    maxPerTrade ?? (settings ? String(settings.maxPerTradeUsd) : "");
  const dailyValue =
    dailyLimit ?? (settings ? String(settings.dailyLimitUsd) : "");

  const save = (data: {
    enabled?: boolean;
    maxPerTradeUsd?: number;
    dailyLimitUsd?: number;
  }) => {
    update.mutate(
      { data },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({
            queryKey: getGetOandaAutoTradeSettingsQueryKey(),
          });
          if (data.enabled !== undefined) {
            toast({
              title: updated.enabled
                ? "OANDA auto-trading enabled"
                : "OANDA auto-trading disabled",
              description: updated.enabled
                ? `The AI bot will execute its forex & commodity trades on your OANDA ${mode} account, up to ${formatCurrency(updated.maxPerTradeUsd)} per trade and ${formatCurrency(updated.dailyLimitUsd)} per day.`
                : undefined,
            });
          } else {
            toast({ title: "Limits saved" });
          }
        },
        onError: (error: any) => {
          toast({
            title: "Could not save settings",
            description:
              error?.response?.data?.error ??
              (error instanceof Error ? error.message : "Please try again"),
            variant: "destructive",
          });
        },
      },
    );
  };

  const saveLimits = () => {
    const max = Number(maxValue);
    const daily = Number(dailyValue);
    if (isNaN(max) || max < 1 || isNaN(daily) || daily < 1) return;
    save({ maxPerTradeUsd: max, dailyLimitUsd: daily });
  };

  if (isLoading || !settings) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5" /> AI Auto-Trader (OANDA)
          </CardTitle>
          <Switch
            checked={settings.enabled}
            disabled={update.isPending}
            onCheckedChange={(checked) => save({ enabled: checked })}
          />
        </div>
        <CardDescription>
          When enabled, the AI bot executes its forex, commodity and index
          trades on this OANDA account with the caps below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.enabled && mode === "live" && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            The bot is trading with real money on leveraged instruments. Keep
            the limits conservative.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="oat-max">Max per trade (USD)</Label>
            <Input
              id="oat-max"
              type="number"
              min={1}
              value={maxValue}
              onChange={(e) => setMaxPerTrade(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oat-daily">Daily limit (USD)</Label>
            <Input
              id="oat-daily"
              type="number"
              min={1}
              value={dailyValue}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Used today:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(settings.spentTodayUsd)}
            </span>{" "}
            of {formatCurrency(settings.dailyLimitUsd)}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={saveLimits}
            disabled={
              update.isPending || (maxPerTrade === null && dailyLimit === null)
            }
          >
            Save limits
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BrokerDashboard({ status }: { status: BrokerStatus }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  const { data: positions, isLoading: positionsLoading } =
    useListBrokerPositions({
      query: {
        queryKey: getListBrokerPositionsQueryKey(),
        refetchInterval: 15000,
      },
    });
  const { data: orders, isLoading: ordersLoading } = useListBrokerOrders({
    query: { queryKey: getListBrokerOrdersQueryKey(), refetchInterval: 15000 },
  });
  const placeOrder = usePlaceBrokerOrder();
  const disconnect = useDisconnectBroker();

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetBrokerStatusQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getListBrokerPositionsQueryKey(),
    });
    queryClient.invalidateQueries({ queryKey: getListBrokerOrdersQueryKey() });
  };

  const handleOrder = () => {
    const notional = Number(amount);
    if (!symbol.trim() || isNaN(notional) || notional < 1) return;
    placeOrder.mutate(
      { data: { symbol: symbol.trim().toUpperCase(), side, notional } },
      {
        onSuccess: (order) => {
          toast({
            title: "Order placed",
            description: `${side === "buy" ? "Buying" : "Selling"} ${formatCurrency(notional)} of ${order.symbol} (${order.status})`,
          });
          setAmount("");
          refetchAll();
        },
        onError: (error) => {
          toast({
            title: "Order failed",
            description:
              error instanceof Error
                ? error.message
                : "Alpaca rejected the order",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Broker disconnected" });
        queryClient.invalidateQueries({
          queryKey: getGetBrokerStatusQueryKey(),
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge
            variant={status.mode === "live" ? "destructive" : "secondary"}
            className="uppercase"
          >
            {status.mode === "live" ? "Live · Real Money" : "Paper Account"}
          </Badge>
          {status.apiKeyMasked && (
            <span className="text-xs text-muted-foreground font-mono">
              {status.apiKeyMasked}
            </span>
          )}
          {status.status && status.status !== "ACTIVE" && (
            <Badge variant="outline">{status.status}</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnect.isPending}
        >
          <Unlink className="w-4 h-4 mr-1.5" /> Disconnect
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Cash", value: status.cash },
          { label: "Buying Power", value: status.buyingPower },
          { label: "Equity", value: status.equity },
          { label: "Portfolio Value", value: status.portfolioValue },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">
                {formatCurrency(s.value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Banknote className="w-5 h-5" /> Place order
            </CardTitle>
            <CardDescription>
              Market order by dollar amount. Fractional shares supported —
              minimum $1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex p-1 bg-muted rounded-lg">
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all ${
                    side === s
                      ? s === "buy"
                        ? "bg-green-600 text-white shadow-sm"
                        : "bg-red-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-symbol">Symbol</Label>
              <Input
                id="rm-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL, TSLA, BTC/USD..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-amount">Amount (USD)</Label>
              <Input
                id="rm-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="20.00"
              />
            </div>
            <Button
              onClick={handleOrder}
              disabled={
                placeOrder.isPending ||
                !symbol.trim() ||
                !amount ||
                Number(amount) < 1
              }
              className="w-full"
              variant={side === "buy" ? "default" : "destructive"}
            >
              {placeOrder.isPending
                ? "Submitting..."
                : `${side === "buy" ? "Buy" : "Sell"} ${amount && Number(amount) >= 1 ? formatCurrency(Number(amount)) : ""}`}
            </Button>
            {status.mode === "live" && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> This uses real money
                in your Alpaca account.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {positionsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !positions || positions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No open positions yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4">Symbol</th>
                      <th className="py-2 pr-4 text-right">Qty</th>
                      <th className="py-2 pr-4 text-right">Avg Entry</th>
                      <th className="py-2 pr-4 text-right">Price</th>
                      <th className="py-2 pr-4 text-right">Value</th>
                      <th className="py-2 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.symbol} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-semibold">{p.symbol}</td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {p.qty}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {formatCurrency(p.avgEntryPrice)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {formatCurrency(p.currentPrice)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {formatCurrency(p.marketValue)}
                        </td>
                        <td
                          className={`py-2 text-right font-mono ${p.unrealizedPl >= 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {p.unrealizedPl >= 0 ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5" />
                            )}
                            {formatCurrency(p.unrealizedPl)} (
                            {p.unrealizedPlPercent.toFixed(2)}%)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AutoTradeCard mode={status.mode ?? "paper"} />
        <TransfersCard mode={status.mode ?? "paper"} cash={status.cash ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent orders</CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !orders || orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No orders yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Symbol</th>
                    <th className="py-2 pr-4">Side</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4 text-right">Filled Qty</th>
                    <th className="py-2 pr-4 text-right">Fill Price</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 font-semibold">{o.symbol}</td>
                      <td
                        className={`py-2 pr-4 capitalize ${o.side === "buy" ? "text-green-500" : "text-red-500"}`}
                      >
                        {o.side}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {o.notional != null
                          ? formatCurrency(o.notional)
                          : o.qty != null
                            ? `${o.qty} sh`
                            : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {o.filledQty ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {o.filledAvgPrice != null
                          ? formatCurrency(o.filledAvgPrice)
                          : "—"}
                      </td>
                      <td className="py-2">
                        <Badge
                          variant={
                            o.status === "filled" ? "secondary" : "outline"
                          }
                          className="capitalize"
                        >
                          {o.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AutoTradeCard({ mode }: { mode: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetBrokerAutoTradeSettings({
    query: { queryKey: getGetBrokerAutoTradeSettingsQueryKey() },
  });
  const update = useUpdateBrokerAutoTradeSettings();

  const [maxPerTrade, setMaxPerTrade] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState<string | null>(null);

  const maxValue =
    maxPerTrade ?? (settings ? String(settings.maxPerTradeUsd) : "");
  const dailyValue =
    dailyLimit ?? (settings ? String(settings.dailyLimitUsd) : "");

  const save = (data: {
    enabled?: boolean;
    maxPerTradeUsd?: number;
    dailyLimitUsd?: number;
  }) => {
    update.mutate(
      { data },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({
            queryKey: getGetBrokerAutoTradeSettingsQueryKey(),
          });
          if (data.enabled !== undefined) {
            toast({
              title: updated.enabled
                ? "Real-money auto-trading enabled"
                : "Real-money auto-trading disabled",
              description: updated.enabled
                ? `The AI bot will mirror its stock & crypto trades to your Alpaca ${mode} account, up to ${formatCurrency(updated.maxPerTradeUsd)} per trade and ${formatCurrency(updated.dailyLimitUsd)} per day.`
                : undefined,
            });
          } else {
            toast({ title: "Limits saved" });
          }
        },
        onError: (error) => {
          toast({
            title: "Could not save settings",
            description:
              error instanceof Error ? error.message : "Please try again",
            variant: "destructive",
          });
        },
      },
    );
  };

  const saveLimits = () => {
    const max = Number(maxValue);
    const daily = Number(dailyValue);
    if (isNaN(max) || max < 1 || isNaN(daily) || daily < 1) return;
    save({ maxPerTradeUsd: max, dailyLimitUsd: daily });
  };

  if (isLoading || !settings) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5" /> AI Auto-Trader
          </CardTitle>
          <Switch
            checked={settings.enabled}
            disabled={update.isPending}
            onCheckedChange={(checked) => save({ enabled: checked })}
          />
        </div>
        <CardDescription>
          When enabled, the AI bot executes its stock and crypto trades on this
          Alpaca account with the caps below. Forex and commodity trades run on
          your OANDA account instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.enabled && mode === "live" && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            The bot is trading with real money. Keep the limits conservative.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="at-max">Max per trade (USD)</Label>
            <Input
              id="at-max"
              type="number"
              min={1}
              value={maxValue}
              onChange={(e) => setMaxPerTrade(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="at-daily">Daily limit (USD)</Label>
            <Input
              id="at-daily"
              type="number"
              min={1}
              value={dailyValue}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Used today:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(settings.spentTodayUsd)}
            </span>{" "}
            of {formatCurrency(settings.dailyLimitUsd)}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={saveLimits}
            disabled={
              update.isPending || (maxPerTrade === null && dailyLimit === null)
            }
          >
            Save limits
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TransfersCard({ mode, cash }: { mode: string; cash: number }) {
  const dashboardUrl =
    mode === "live"
      ? "https://app.alpaca.markets"
      : "https://app.alpaca.markets/paper/dashboard/overview";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="w-5 h-5" /> Move money
        </CardTitle>
        <CardDescription>
          Deposits and withdrawals between your bank and Alpaca happen securely
          on Alpaca's own site — API keys can never move money, which protects
          your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-md bg-muted">
          <p className="text-sm text-muted-foreground">
            Cash available to trade or withdraw
          </p>
          <p className="text-2xl font-bold">{formatCurrency(cash)}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button asChild variant="outline">
            <a href={dashboardUrl} target="_blank" rel="noreferrer">
              Deposit funds <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={dashboardUrl} target="_blank" rel="noreferrer">
              Withdraw to bank <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          In Alpaca's dashboard, use{" "}
          <span className="font-semibold">Banking → Transfers</span> to link
          your bank account (ACH), add funds, or withdraw your cash balance.
          Withdrawals typically settle in 1–3 business days.
          {mode === "paper" &&
            " Paper accounts use virtual cash — switch to a live account to move real money."}
        </p>
      </CardContent>
    </Card>
  );
}
