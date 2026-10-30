import { useState } from "react";
import { useAuth } from "@workspace/auth-web";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/csrf-fetch";

export function AccountDeletionCard() {
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsDeleting(true);

    try {
      const response = await csrfFetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setError(data?.error ?? "Unable to delete your account.");
        setIsDeleting(false);
        return;
      }

      logout();
    } catch (requestError) {
      console.error("Unable to submit the account deletion request.", requestError);
      setError("Unable to reach the service. Check your connection and try again.");
      setIsDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/40 bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" />
          Delete account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm text-muted-foreground">
            This permanently deletes your NexusTrade account, saved broker and
            AI-provider credentials, settings, and associated app records.
            It cannot close broker positions, cancel orders already sent, or
            revoke keys at the providers. Disable automation and review broker
            activity first.
          </p>
        </div>
        <form className="space-y-4" onSubmit={deleteAccount}>
          <div className="space-y-2">
            <Label htmlFor="delete-account-password">Current password</Label>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-account-confirmation">
              Type DELETE to confirm
            </Label>
            <Input
              id="delete-account-confirmation"
              autoComplete="off"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            variant="destructive"
            disabled={isDeleting || confirmation !== "DELETE"}
          >
            {isDeleting ? "Deleting account..." : "Permanently delete account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
