import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { csrfFetch } from "@/lib/csrf-fetch";
import { Coins, Loader2 } from "lucide-react";

type Provider = "anthropic" | "openai" | "gemini";
type BudgetStatus = {
  monthlyBudgetUsd: number | null;
  monthlyUsageUsd: number;
  usageMonth: string;
  providers: Record<Provider, boolean>;
};

const PROVIDERS: Array<{ id: Provider; label: string }> = [
  { id: "anthropic", label: "Claude / Anthropic" },
  { id: "openai", label: "GPT / OpenAI" },
  { id: "gemini", label: "Gemini / Google" },
];

export function AiBudgetCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [budgetInput, setBudgetInput] = useState("100");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    csrfFetch("/api/account/ai-budget")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load AI budget settings");
        return (await response.json()) as BudgetStatus;
      })
      .then((data) => {
        if (!active) return;
        setStatus(data);
        if (data.monthlyBudgetUsd != null) {
          setBudgetInput(String(data.monthlyBudgetUsd));
        }
      })
      .catch(() => {
        if (active) setError("AI budget status could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveBudget() {
    const monthlyBudgetUsd = Number(budgetInput);
    if (
      !Number.isFinite(monthlyBudgetUsd) ||
      monthlyBudgetUsd < 1 ||
      monthlyBudgetUsd > 1_000_000
    ) {
      toast({
        title: "Invalid monthly limit",
        description: "Choose an amount from $1 to $1,000,000.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await csrfFetch("/api/account/ai-budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudgetUsd }),
      });
      const data = (await response.json()) as BudgetStatus & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not save budget");
      setStatus(data);
      toast({ title: "Monthly AI limit saved" });
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Could not save budget";
      setError(message);
      toast({
        title: "Could not save monthly AI limit",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const spent = status?.monthlyUsageUsd ?? 0;
  const limit = status?.monthlyBudgetUsd ?? 0;
  const percentage = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const allProvidersReady =
    status != null && PROVIDERS.every(({ id }) => status.providers[id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-muted-foreground" />
          Shared AI monthly limit
        </CardTitle>
        <CardDescription>
          One customer-set limit covers shared AI predictions and both
          auto-trading bots across Claude, GPT, and Gemini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading budget…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map(({ id, label }) => (
                <Badge
                  key={id}
                  variant="outline"
                  className={
                    status?.providers[id]
                      ? "border-emerald-500/30 text-emerald-500"
                      : "border-amber-500/30 text-amber-500"
                  }
                >
                  {label}: {status?.providers[id] ? "Ready" : "Not configured"}
                </Badge>
              ))}
            </div>
            {!allProvidersReady && (
              <p className="text-sm text-muted-foreground">
                The service operator must configure each provider key and token
                pricing in the API service’s Railway variables. Keys are never
                entered in this account.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="monthly-ai-budget">
                Monthly AI spending limit (USD)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="monthly-ai-budget"
                  type="number"
                  min={1}
                  max={1_000_000}
                  step={1}
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(event.target.value)}
                  aria-describedby="monthly-ai-budget-help"
                />
                <Button onClick={saveBudget} disabled={saving}>
                  {saving ? "Saving…" : "Save limit"}
                </Button>
              </div>
              <p
                id="monthly-ai-budget-help"
                className="text-xs text-muted-foreground"
              >
                A limit must be saved before shared AI can run. $100 is a
                suggested starting value; change it to fit your needs.
              </p>
            </div>

            {status?.monthlyBudgetUsd != null && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Estimated usage ({status.usageMonth})
                  </span>
                  <span className="font-mono">
                    ${spent.toFixed(4)} / ${limit.toFixed(2)}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={limit}
                  aria-valuenow={Math.min(spent, limit)}
                  aria-label="Monthly shared AI budget usage"
                >
                  <div
                    className={`h-full transition-all ${percentage >= 90 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Usage is estimated from provider-reported tokens and the configured
          model rates; the displayed amount temporarily includes reservations
          for requests still in flight. Requests already in flight may finish
          after the limit is reached. This is not a business-wide cap; the
          business’s provider bill remains uncapped unless separate limits are
          set with each AI vendor.
        </p>
      </CardContent>
    </Card>
  );
}
