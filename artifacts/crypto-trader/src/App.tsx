import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
