import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookieNotice } from "@/components/cookie-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csrfFetch } from "@/lib/csrf-fetch";
import { useAuth } from "@workspace/auth-web";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Trade from "@/pages/trade";
import Portfolio from "@/pages/portfolio";
import History from "@/pages/history";
import Predictions from "@/pages/predictions";
import Watchlist from "@/pages/watchlist";
import AutoTrade from "@/pages/auto-trade";
import DayTrade from "@/pages/day-trade";
import MarketOverview from "@/pages/market-overview";
import Account from "@/pages/account";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import Terms from "@/pages/terms";
import CookiePolicy from "@/pages/cookie-policy";
import RefundPolicy from "@/pages/refund-policy";
import TradingDisclosures from "@/pages/trading-disclosures";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function StepUpPrompt() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const show = () => {
      setError(null);
      setPassword("");
      setOpen(true);
    };
    window.addEventListener("nexustrade:step-up-required", show);
    return () =>
      window.removeEventListener("nexustrade:step-up-required", show);
  }, []);

  if (!open) return null;

  async function reauthenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const response = await csrfFetch("/api/auth/reauthenticate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      setError("Password verification failed.");
      return;
    }
    setOpen(false);
    setPassword("");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={reauthenticate}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-2xl"
      >
        <div>
          <h2 className="text-lg font-semibold">Verify your password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This action affects your broker, AI keys, or automated trading
            settings.
          </p>
        </div>
        <label htmlFor="step-up-password" className="block text-sm font-medium">
          Current password
        </label>
        <Input
          id="step-up-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Verifying..." : "Verify"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/terms" component={Terms} />
      <Route path="/cookies" component={CookiePolicy} />
      <Route path="/refunds" component={RefundPolicy} />
      <Route path="/trading-disclosures" component={TradingDisclosures} />
      <Route>
        <AuthGuard>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/trade" component={Trade} />
              <Route path="/portfolio" component={Portfolio} />
              <Route path="/history" component={History} />
              <Route path="/predictions" component={Predictions} />
              <Route path="/market" component={MarketOverview} />
              <Route path="/live">
                <Redirect to="/market?view=live" />
              </Route>
              <Route path="/auto-trade" component={AutoTrade} />
              <Route path="/day-trade" component={DayTrade} />
              <Route path="/watchlist" component={Watchlist} />
              <Route path="/account" component={Account} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </AuthGuard>
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <CookieNotice />
        <StepUpPrompt />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
