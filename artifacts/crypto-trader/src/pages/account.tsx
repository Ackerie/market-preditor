import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/auth-web";
import {
  useGetPortfolio,
  useGetBrokerStatus,
  useGetOandaStatus,
  useGetKrakenStatus,
  useGetNotificationPrefs,
  useUpdateNotificationPrefs,
  getGetNotificationPrefsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/components/shared";
import { Switch } from "@/components/ui/switch";
import {
  User,
  Building2,
  LogOut,
  TrendingUp,
  Globe,
  ExternalLink,
  Link2,
  Bell,
  Plus,
  Coins,
  KeyRound,
  Trash2,
} from "lucide-react";
import RealMoney from "@/pages/real-money";
import { csrfFetch } from "@/lib/csrf-fetch";

function NotificationsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: prefs, isLoading } = useGetNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();

  const handleToggle = (checked: boolean) => {
    updatePrefs.mutate(
      { data: { autoTradeEmailAlerts: checked } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetNotificationPrefsQueryKey(),
          });
          toast({
            title: checked ? "Email alerts enabled" : "Email alerts disabled",
            description: checked
              ? "You'll get an email when an auto-trade is rejected or your daily cap is reached."
              : "You will no longer receive auto-trade alert emails.",
          });
        },
        onError: () =>
          toast({
            title: "Error",
            description: "Failed to update notification settings.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-muted-foreground" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">Auto-trade email alerts</div>
              <p className="text-xs text-muted-foreground mt-1">
                Get an email the moment a broker rejects an auto-trade order or
                your daily spending cap is reached (at most one email per issue
                per broker per day).
                {prefs?.email ? (
                  <>
                    {" "}
                    Alerts go to{" "}
                    <span className="font-mono">{prefs.email}</span>.
                  </>
                ) : (
                  " No email address is on file from your sign-in provider, so alerts can't be delivered."
                )}
              </p>
            </div>
            <Switch
              checked={prefs?.autoTradeEmailAlerts ?? false}
              onCheckedChange={handleToggle}
              disabled={updatePrefs.isPending || !prefs?.email}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const AI_PROVIDERS = [
  { id: "anthropic", name: "Claude / Anthropic" },
  { id: "openai", name: "GPT / OpenAI" },
  { id: "gemini", name: "Gemini / Google" },
] as const;

function AiCredentialsCard() {
  const [configured, setConfigured] = useState<Record<string, string | null>>(
    {},
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    csrfFetch("/api/account/ai-credentials")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        setConfigured(
          Object.fromEntries(
            data.providers.map(
              (item: { provider: string; maskedKey: string | null }) => [
                item.provider,
                item.maskedKey,
              ],
            ),
          ),
        );
      })
      .catch(() => undefined);
  }, []);

  async function save(provider: string) {
    const apiKey = values[provider]?.trim() ?? "";
    if (apiKey.length < 10) {
      toast({
        title: "Invalid API key",
        description: "Enter the complete provider key.",
        variant: "destructive",
      });
      return;
    }
    setBusy(provider);
    const response = await csrfFetch(
      `/api/account/ai-credentials/${provider}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey }),
      },
    );
    setBusy(null);
    if (!response.ok) {
      toast({
        title: "Could not save key",
        description: "The provider key was rejected by the server.",
        variant: "destructive",
      });
      return;
    }
    const data = await response.json();
    setConfigured((current) => ({ ...current, [provider]: data.maskedKey }));
    setValues((current) => ({ ...current, [provider]: "" }));
    toast({
      title: "AI key saved",
      description:
        "Your key is encrypted before storage and is never shown in full.",
    });
  }

  async function remove(provider: string) {
    setBusy(provider);
    await csrfFetch(`/api/account/ai-credentials/${provider}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(null);
    setConfigured((current) => ({ ...current, [provider]: null }));
    toast({
      title: "AI key removed",
      description: "The personal provider key was deleted.",
    });
  }

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          Personal AI API keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Optional. Personal keys are encrypted on the server and used for your
          AI requests. Never paste a key into a URL or chat message.
        </p>
        {AI_PROVIDERS.map((provider) => (
          <div key={provider.id} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor={`ai-key-${provider.id}`}
                className="text-sm font-medium"
              >
                {provider.name}
              </label>
              {configured[provider.id] && (
                <span className="text-xs text-emerald-400">
                  Configured: {configured[provider.id]}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`ai-key-${provider.id}`}
                type="password"
                autoComplete="off"
                value={values[provider.id] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [provider.id]: event.target.value,
                  }))
                }
                placeholder={
                  configured[provider.id]
                    ? "Enter a replacement key"
                    : "Paste provider API key"
                }
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => save(provider.id)}
                disabled={busy === provider.id}
              >
                {busy === provider.id ? "Saving..." : "Save key"}
              </Button>
              {configured[provider.id] && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => remove(provider.id)}
                  disabled={busy === provider.id}
                  aria-label={`Remove ${provider.name} key`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium font-mono">{value}</span>
    </div>
  );
}

function AlpacaDetailsCard({ onConnect }: { onConnect: () => void }) {
  const { data: status, isLoading } = useGetBrokerStatus();

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
            Alpaca — Stocks & Crypto
          </span>
          {status?.connected ? (
            <Badge
              variant="outline"
              className={
                status.mode === "live"
                  ? "text-amber-500 border-amber-500/30"
                  : "text-emerald-500 border-emerald-500/30"
              }
            >
              {status.mode === "live" ? "Live" : "Paper"} ·{" "}
              {status.status ?? "UNKNOWN"}
            </Badge>
          ) : !isLoading ? (
            <Badge variant="outline" className="text-muted-foreground">
              Not connected
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Equity", value: formatCurrency(status.equity ?? 0) },
                { label: "Cash", value: formatCurrency(status.cash ?? 0) },
                {
                  label: "Buying Power",
                  value: formatCurrency(status.buyingPower ?? 0),
                },
                {
                  label: "Portfolio Value",
                  value: formatCurrency(status.portfolioValue ?? 0),
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="p-3 bg-muted/30 rounded-lg border border-border"
                >
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                    {label}
                  </div>
                  <div className="text-lg font-bold font-mono">{value}</div>
                </div>
              ))}
            </div>
            <div>
              <DetailRow
                label="Account number"
                value={status.accountNumber || "—"}
              />
              <DetailRow label="Currency" value={status.currency ?? "USD"} />
              <DetailRow
                label="Long market value"
                value={formatCurrency(status.longMarketValue ?? 0)}
              />
              <DetailRow
                label="Short market value"
                value={formatCurrency(status.shortMarketValue ?? 0)}
              />
              <DetailRow
                label="Last equity (prev close)"
                value={formatCurrency(status.lastEquity ?? 0)}
              />
              <DetailRow
                label="Maintenance margin"
                value={formatCurrency(status.maintenanceMargin ?? 0)}
              />
              <DetailRow
                label="Initial margin"
                value={formatCurrency(status.initialMargin ?? 0)}
              />
              <DetailRow
                label="Margin multiplier"
                value={`${status.multiplier ?? 1}x`}
              />
              <DetailRow
                label="Day trades (5-day window)"
                value={status.daytradeCount ?? 0}
              />
              <DetailRow
                label="Pattern day trader"
                value={
                  status.patternDayTrader ? (
                    <span className="text-amber-500">Yes</span>
                  ) : (
                    "No"
                  )
                }
              />
              <DetailRow
                label="Shorting enabled"
                value={status.shortingEnabled ? "Yes" : "No"}
              />
              <DetailRow label="API key" value={status.apiKeyMasked ?? "—"} />
              {status.createdAt ? (
                <DetailRow
                  label="Account opened"
                  value={new Date(status.createdAt).toLocaleDateString()}
                />
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={
                    status.mode === "live"
                      ? "https://app.alpaca.markets"
                      : "https://app.alpaca.markets/paper/dashboard/overview"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Alpaca dashboard{" "}
                  <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">No Alpaca account connected.</p>
            <Button variant="outline" size="sm" onClick={onConnect}>
              Connect Alpaca account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OandaDetailsCard({ onConnect }: { onConnect: () => void }) {
  const { data: status, isLoading } = useGetOandaStatus();

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-muted-foreground" />
            OANDA — Forex, Commodities & Index CFDs
          </span>
          {status?.connected ? (
            <Badge
              variant="outline"
              className={
                status.mode === "live"
                  ? "text-amber-500 border-amber-500/30"
                  : "text-emerald-500 border-emerald-500/30"
              }
            >
              {status.mode === "live" ? "Live" : "Practice"}
            </Badge>
          ) : !isLoading ? (
            <Badge variant="outline" className="text-muted-foreground">
              Not connected
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: "Balance",
                  value: formatCurrency(status.balance ?? 0),
                },
                { label: "NAV", value: formatCurrency(status.nav ?? 0) },
                {
                  label: "Unrealized P&L",
                  value: formatCurrency(status.unrealizedPl ?? 0),
                },
                {
                  label: "Margin Available",
                  value: formatCurrency(status.marginAvailable ?? 0),
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="p-3 bg-muted/30 rounded-lg border border-border"
                >
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                    {label}
                  </div>
                  <div className="text-lg font-bold font-mono">{value}</div>
                </div>
              ))}
            </div>
            <div>
              <DetailRow
                label="Account ID"
                value={status.accountIdMasked ?? "—"}
              />
              {status.alias ? (
                <DetailRow label="Account alias" value={status.alias} />
              ) : null}
              <DetailRow label="Currency" value={status.currency ?? "USD"} />
              <DetailRow
                label="Realized P&L (lifetime)"
                value={formatCurrency(status.realizedPl ?? 0)}
              />
              <DetailRow
                label="Margin used"
                value={formatCurrency(status.marginUsed ?? 0)}
              />
              {status.marginRate ? (
                <DetailRow
                  label="Margin rate"
                  value={`${(status.marginRate * 100).toFixed(1)}% (${Math.round(1 / status.marginRate)}:1 leverage)`}
                />
              ) : null}
              <DetailRow
                label="Open positions"
                value={status.openPositionCount ?? 0}
              />
              <DetailRow
                label="Open trades"
                value={status.openTradeCount ?? 0}
              />
              <DetailRow
                label="Pending orders"
                value={status.pendingOrderCount ?? 0}
              />
              <DetailRow
                label="Withdrawal limit"
                value={formatCurrency(status.withdrawalLimit ?? 0)}
              />
              {status.createdTime ? (
                <DetailRow
                  label="Account opened"
                  value={new Date(status.createdTime).toLocaleDateString()}
                />
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={
                    status.mode === "live"
                      ? "https://www.oanda.com/us-en/trading/"
                      : "https://trade.oanda.com"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open OANDA platform{" "}
                  <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">No OANDA account connected.</p>
            <Button variant="outline" size="sm" onClick={onConnect}>
              Connect OANDA account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KrakenDetailsCard({ onConnect }: { onConnect: () => void }) {
  const { data: status, isLoading } = useGetKrakenStatus();

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-muted-foreground" />
            Kraken — Crypto Spot
          </span>
          {status?.connected ? (
            <Badge
              variant="outline"
              className="text-amber-500 border-amber-500/30"
            >
              Live
            </Badge>
          ) : !isLoading ? (
            <Badge variant="outline" className="text-muted-foreground">
              Not connected
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : status?.connected ? (
          <div>
            <DetailRow
              label="Cash (USD)"
              value={formatCurrency(status.cash ?? 0)}
            />
            <DetailRow
              label="Crypto equity"
              value={formatCurrency(status.equity ?? 0)}
            />
            <DetailRow label="API key" value={status.apiKeyMasked ?? "—"} />
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Coins className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">No Kraken account connected.</p>
            <Button variant="outline" size="sm" onClick={onConnect}>
              Connect Kraken account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Account() {
  const [tab, setTab] = useState("brokers");
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: portfolio } = useGetPortfolio();
  const { data: krakenStatus } = useGetKrakenStatus();

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            My Account
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your profile and broker accounts
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>

      {/* Account summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt={`${user.firstName ?? user.email ?? "Trader"} profile photo`}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <User className="w-6 h-6 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">
                {user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : (user?.firstName ?? "Trader")}
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {user?.email ?? "No email"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
              Broker Cash
            </div>
            <div className="text-2xl font-bold font-mono text-primary">
              {portfolio ? (
                formatCurrency(portfolio.usdBalance)
              ) : (
                <Skeleton className="h-8 w-28" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
              Connected Brokers
            </div>
            <div className="flex items-center gap-2 mt-1">
              {portfolio ? (
                <>
                  <Badge
                    variant="outline"
                    className={
                      portfolio.alpacaConnected
                        ? "text-emerald-500 border-emerald-500/30"
                        : "text-muted-foreground"
                    }
                  >
                    Alpaca {portfolio.alpacaConnected ? "✓" : "—"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      portfolio.oandaConnected
                        ? "text-emerald-500 border-emerald-500/30"
                        : "text-muted-foreground"
                    }
                  >
                    OANDA {portfolio.oandaConnected ? "✓" : "—"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      krakenStatus?.connected
                        ? "text-emerald-500 border-emerald-500/30"
                        : "text-muted-foreground"
                    }
                  >
                    Kraken {krakenStatus?.connected ? "✓" : "—"}
                  </Badge>
                </>
              ) : (
                <Skeleton className="h-6 w-32" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="brokers" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Brokers
          </TabsTrigger>
          <TabsTrigger value="connections" className="flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Connections
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" /> Profile
          </TabsTrigger>
        </TabsList>

        {/* ── BROKERS TAB ── */}
        <TabsContent value="brokers">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Broker Accounts</h2>
              <Button size="sm" onClick={() => setTab("connections")}>
                <Plus className="w-4 h-4 mr-1.5" /> Add broker
              </Button>
            </div>
            <AlpacaDetailsCard onConnect={() => setTab("connections")} />
            <OandaDetailsCard onConnect={() => setTab("connections")} />
            <KrakenDetailsCard onConnect={() => setTab("connections")} />
          </div>
        </TabsContent>

        {/* ── CONNECTIONS TAB (broker linking & auto-trade, moved from Trade page) ── */}
        <TabsContent value="connections">
          <RealMoney />
        </TabsContent>

        {/* ── PROFILE TAB ── */}
        <TabsContent value="profile">
          <div className="space-y-6">
            <NotificationsCard />
            <AiCredentialsCard />
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-muted-foreground" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  NexusTrade stores only the email address and optional display
                  name used for your account. Contact details, date of birth,
                  and postal address are not collected.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
