import { useAuth } from "@workspace/auth-web";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { TrendingUp, Shield, Zap, BarChart2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const { isAuthenticated, isLoading, login, register } = useAuth();
  const [, navigate] = useLocation();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResetMessage(null);
    setIsSubmitting(true);
    if (isForgotPassword) {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      setIsSubmitting(false);
      if (response.ok) {
        setResetMessage(
          "If an account exists for that email, a reset link has been sent.",
        );
      } else {
        setError("Unable to request a password reset");
      }
      return;
    }
    const authError = isRegistering
      ? await register(email, password, confirmPassword, firstName, lastName)
      : await login(email, password);
    setIsSubmitting(false);
    if (authError) {
      setError(authError);
      return;
    }
    navigate("/");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-card border-r border-border flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center font-bold text-primary-foreground text-lg">
            N
          </div>
          <span className="text-xl font-bold tracking-tight">NexusTrade</span>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight mb-4">
              Trade smarter with{" "}
              <span className="text-primary">AI-powered</span> insights
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Trade crypto, stocks, forex, and commodities on your own broker
              accounts with real-time prices, Claude AI predictions, and
              professional-grade charts — all in one terminal.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                icon: BarChart2,
                title: "Real-time candlestick charts",
                desc: "Professional OHLCV charts with technical indicators",
              },
              {
                icon: Zap,
                title: "AI market predictions",
                desc: "Claude-powered signals with confidence scores and targets",
              },
              {
                icon: Shield,
                title: "Your brokers, your money",
                desc: "Link Alpaca and OANDA accounts — credentials encrypted at rest",
              },
              {
                icon: TrendingUp,
                title: "49 instruments across 5 markets",
                desc: "10 cryptos, 10 US stocks, 8 forex pairs, 13 futures, 8 commodities",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{title}</div>
                  <div className="text-muted-foreground text-sm">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          NexusTrade routes real orders to your linked Alpaca and OANDA
          accounts. Trading involves risk.
        </p>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center font-bold text-primary-foreground">
              N
            </div>
            <span className="text-lg font-bold">NexusTrade</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">
              {isForgotPassword
                ? "Reset your password"
                : isRegistering
                  ? "Create your account"
                  : "Welcome back"}
            </h2>
            <p className="text-muted-foreground">
              {isForgotPassword
                ? "Enter your email and we will send you a secure reset link."
                : isRegistering
                  ? "Create a secure NexusTrade account to manage your trading terminal."
                  : "Sign in to access your trading account and portfolio."}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isRegistering && !isForgotPassword && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="First name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
                <Input
                  placeholder="Last name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            )}
            <Input
              type="email"
              placeholder="Email address"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {!isForgotPassword && (
              <Input
                type="password"
                placeholder="Password"
                autoComplete={
                  isRegistering ? "new-password" : "current-password"
                }
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
            {isRegistering && !isForgotPassword && (
              <Input
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {resetMessage && (
              <p className="text-sm text-primary">{resetMessage}</p>
            )}
            <Button
              className="w-full h-12 text-base font-semibold"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Please wait..."
                : isForgotPassword
                  ? "Send reset link"
                  : isRegistering
                    ? "Create account"
                    : "Sign in to NexusTrade"}
            </Button>
            {!isRegistering && !isForgotPassword && (
              <button
                type="button"
                className="w-full text-sm text-primary hover:underline"
                onClick={() => {
                  setError(null);
                  setIsForgotPassword(true);
                }}
              >
                Forgot your password?
              </button>
            )}
            <button
              type="button"
              className="w-full text-sm text-primary hover:underline"
              onClick={() => {
                setError(null);
                setResetMessage(null);
                if (isForgotPassword) {
                  setIsForgotPassword(false);
                  setIsRegistering(false);
                } else {
                  setIsRegistering((value) => !value);
                }
              }}
            >
              {isForgotPassword
                ? "Back to sign in"
                : isRegistering
                  ? "Already have an account? Sign in"
                  : "New to NexusTrade? Create an account"}
            </button>
          </form>

          <div className="pt-6 border-t border-border">
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { value: "49", label: "Instruments" },
                { value: "2", label: "Broker integrations" },
                { value: "AI", label: "Powered predictions" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div className="text-xl font-bold text-primary">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
