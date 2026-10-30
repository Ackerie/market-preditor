import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/csrf-fetch";

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      const response = await csrfFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        setError(data?.error ?? "Unable to change your password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(
        data?.message ??
          "Password changed. Other active sessions have been signed out.",
      );
    } catch (requestError) {
      console.error("Unable to submit the password change request.", requestError);
      setError("Unable to reach the service. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          Change password
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose a new password with at least 8 characters. Other active
          sessions will be signed out.
        </p>
        <form className="space-y-4" onSubmit={changePassword}>
          <div className="space-y-2">
            <Label htmlFor="current-account-password">Current password</Label>
            <Input
              id="current-account-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-account-password">New password</Label>
            <Input
              id="new-account-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-account-password">
              Confirm new password
            </Label>
            <Input
              id="confirm-account-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-emerald-500" role="status">
              {success}
            </p>
          )}
          <Button
            type="submit"
            disabled={
              isSaving ||
              newPassword.length < 8 ||
              newPassword !== confirmPassword
            }
          >
            {isSaving ? "Changing password..." : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
