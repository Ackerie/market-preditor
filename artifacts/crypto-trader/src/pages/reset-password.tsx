import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token =
    new URLSearchParams(window.location.hash.slice(1)).get("token") ??
    new URLSearchParams(window.location.search).get("token") ??
    "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password, confirmPassword }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    setIsSubmitting(false);
    if (!response.ok) {
      setError(data?.error ?? "Unable to reset password");
      return;
    }
    setMessage(data?.message ?? "Password reset successfully");
    setTimeout(() => navigate("/login"), 1200);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Choose a new password
          </h1>
          <p className="text-muted-foreground mt-2">
            Your new password must be at least 8 characters.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-primary">{message}</p>}
          <Button
            className="w-full h-11"
            type="submit"
            disabled={isSubmitting || !token}
          >
            {isSubmitting ? "Updating..." : "Update password"}
          </Button>
        </form>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          By resetting your password, you acknowledge the{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms and Conditions
          </Link>
          ,{" "}
          <Link href="/cookies" className="text-primary hover:underline">
            Cookie Policy
          </Link>
          , and{" "}
          <Link href="/refunds" className="text-primary hover:underline">
            Refund Policy
          </Link>
          .
        </p>
        <Link
          href="/login"
          className="block text-center text-sm text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
