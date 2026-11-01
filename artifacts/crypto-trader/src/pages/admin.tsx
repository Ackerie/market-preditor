import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Users, Activity, RefreshCw } from "lucide-react";
import { apiFetch, useAuth } from "@workspace/auth-web";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";

interface AdminOverview {
  ok: boolean;
  environment: {
    nodeEnv: string;
    adminModeEnabled: boolean;
  };
  stats: {
    totalUsers: number;
    activeSessions: number;
    brokerConnections: number;
    autoTradeEnabledUsers: number;
  };
  security: {
    httpOnlySessionCookies: boolean;
    csrfProtection: boolean;
    rateLimiting: boolean;
    corsOriginRestriction: boolean;
    adminOnlyAccess: boolean;
    sessionExpiryDays: number;
    stepUpWindowMinutes: number;
  };
}

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  paidAccessEnabled: boolean;
  subscriptionExpiresAt: string | null;
}

interface AccessSettings {
  paidAccessEnabled: boolean;
  aiAccessRestricted: boolean;
  autoTradeRestricted: boolean;
  dayTradeRestricted: boolean;
  subscriptionMonthlyPriceUsd: number;
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [accessSettings, setAccessSettings] = useState<AccessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [userActionBusy, setUserActionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    if (!user?.isAdmin) return;
    void loadAdminData();
  }, [user?.isAdmin]);

  async function loadAdminData() {
    setLoading(true);
    setNotice(null);

    const [overviewRes, usersRes, accessRes] = await Promise.all([
      apiFetch("/api/admin/overview", { credentials: "include" }),
      apiFetch("/api/admin/users", { credentials: "include" }),
      apiFetch("/api/admin/access-settings", { credentials: "include" }),
    ]);

    if (!overviewRes.ok || !usersRes.ok || !accessRes.ok) {
      setNotice("Unable to load admin controls. Please sign in again.");
      setLoading(false);
      return;
    }

    setOverview((await overviewRes.json()) as AdminOverview);
    setUsers(((await usersRes.json()) as { users: AdminUser[] }).users ?? []);
    setAccessSettings(((await accessRes.json()) as { settings: AccessSettings }).settings ?? null);
    setLoading(false);
  }

  async function revokeSessions() {
    setActionBusy(true);
    setNotice(null);
    const response = await apiFetch("/api/admin/sessions/revoke", {
      method: "POST",
      credentials: "include",
    });
    setActionBusy(false);

    if (!response.ok) {
      setNotice("Unable to revoke sessions.");
      return;
    }

    await loadAdminData();
    setNotice("Other sessions were revoked successfully.");
  }

  async function saveAccessSettings() {
    if (!accessSettings) return;
    setSavingAccess(true);
    setNotice(null);
    const response = await apiFetch("/api/admin/access-settings", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(accessSettings),
    });
    setSavingAccess(false);

    if (!response.ok) {
      setNotice("Unable to update access controls.");
      return;
    }

    const data = (await response.json()) as { settings: AccessSettings };
    setAccessSettings(data.settings);
    setNotice("Access controls updated successfully.");
  }

  async function sendPasswordReset(userId: string) {
    setUserActionBusy(userId);
    setNotice(null);
    const response = await apiFetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      credentials: "include",
    });
    setUserActionBusy(null);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unable to send the reset email." }));
      setNotice(error.error ?? "Unable to send the reset email.");
      return;
    }

    setNotice("Password reset link sent successfully.");
  }

  async function updateUserAccess(userId: string, paidAccessEnabled: boolean, subscriptionExpiresAt?: string | null) {
    setUserActionBusy(userId);
    setNotice(null);
    const response = await apiFetch(`/api/admin/users/${userId}/access`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paidAccessEnabled,
        subscriptionExpiresAt: subscriptionExpiresAt ?? null,
      }),
    });
    setUserActionBusy(null);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unable to update paid access." }));
      setNotice(error.error ?? "Unable to update paid access.");
      return;
    }

    const payload = (await response.json()) as {
      paidAccessEnabled: boolean;
      subscriptionExpiresAt: string | null;
    };

    setUsers((current) =>
      current.map((entry) =>
        entry.id === userId
          ? {
              ...entry,
              paidAccessEnabled: payload.paidAccessEnabled,
              subscriptionExpiresAt: payload.subscriptionExpiresAt ?? entry.subscriptionExpiresAt,
            }
          : entry,
      ),
    );
    setNotice(`Paid access ${payload.paidAccessEnabled ? "enabled" : "disabled"} for the selected user.`);
  }

  async function bulkUpdateUserAccess(paidAccessEnabled: boolean) {
    if (!window.confirm(`Apply paid access ${paidAccessEnabled ? "on" : "off"} to all non-admin users?`)) {
      return;
    }

    setActionBusy(true);
    setNotice(null);
    const response = await apiFetch("/api/admin/users/access/bulk", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paidAccessEnabled }),
    });
    setActionBusy(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unable to update all user access levels." }));
      setNotice(error.error ?? "Unable to update all user access levels.");
      return;
    }

    setUsers((current) =>
      current.map((entry) =>
        entry.isAdmin ? entry : { ...entry, paidAccessEnabled },
      ),
    );
    setNotice(`Paid access ${paidAccessEnabled ? "enabled" : "disabled"} for all non-admin users.`);
  }

  async function deleteUser(userId: string) {
    if (!window.confirm("Remove this user from the app? This cannot be undone.")) {
      return;
    }

    setUserActionBusy(userId);
    setNotice(null);
    const response = await apiFetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      credentials: "include",
    });
    setUserActionBusy(null);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unable to remove the user." }));
      setNotice(error.error ?? "Unable to remove the user.");
      return;
    }

    setUsers((current) => current.filter((entry) => entry.id !== userId));
    setNotice("User removed successfully.");
  }

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading admin console…</div>;
  }

  if (!user || !user.isAdmin) {
    return <Redirect to="/" />;
  }

  const metricCards = [
    {
      label: "Total users",
      value: overview?.stats.totalUsers ?? 0,
      icon: Users,
    },
    {
      label: "Active sessions",
      value: overview?.stats.activeSessions ?? 0,
      icon: Activity,
    },
    {
      label: "Broker links",
      value: overview?.stats.brokerConnections ?? 0,
      icon: ShieldCheck,
    },
    {
      label: "Auto-trade enabled",
      value: overview?.stats.autoTradeEnabledUsers ?? 0,
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Admin Console</p>
          <h1 className="text-3xl font-bold tracking-tight">System control panel</h1>
        </div>
        <Button onClick={() => void loadAdminData()} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">User roster</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Manage users</span>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void bulkUpdateUserAccess(true)} disabled={actionBusy || loading}>
              Grant premium to all users
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void bulkUpdateUserAccess(false)} disabled={actionBusy || loading}>
              Remove premium from all users
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No registered users yet.</p>
            ) : (
              users.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium">{entry.firstName ?? "User"} {entry.lastName ?? ""}</p>
                      <p className="text-sm text-muted-foreground">{entry.email ?? "No email"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {entry.isAdmin ? "Admin" : "User"}
                      </span>
                      {!entry.isAdmin && (
                        <span className={`text-[10px] uppercase tracking-[0.2em] ${entry.paidAccessEnabled || (entry.subscriptionExpiresAt && new Date(entry.subscriptionExpiresAt).getTime() > Date.now()) ? "text-emerald-400" : "text-muted-foreground"}`}>
                          {entry.paidAccessEnabled || (entry.subscriptionExpiresAt && new Date(entry.subscriptionExpiresAt).getTime() > Date.now()) ? "Premium" : "Standard"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={entry.paidAccessEnabled}
                        disabled={userActionBusy === entry.id || entry.isAdmin}
                        onChange={(event) =>
                          void updateUserAccess(entry.id, event.target.checked, entry.subscriptionExpiresAt)
                        }
                      />
                      <span>Paid access</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Expires</span>
                      <input
                        type="datetime-local"
                        value={entry.subscriptionExpiresAt ? new Date(entry.subscriptionExpiresAt).toISOString().slice(0, 16) : ""}
                        disabled={userActionBusy === entry.id || entry.isAdmin}
                        onChange={(event) =>
                          void updateUserAccess(
                            entry.id,
                            entry.paidAccessEnabled,
                            event.target.value ? new Date(event.target.value).toISOString() : null,
                          )
                        }
                        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void sendPasswordReset(entry.id)}
                      disabled={userActionBusy === entry.id || entry.isAdmin}
                    >
                      {userActionBusy === entry.id ? "Sending…" : "Send reset link"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void deleteUser(entry.id)}
                      disabled={userActionBusy === entry.id || entry.isAdmin || entry.id === user.id}
                    >
                      Remove user
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="text-lg font-semibold">Security posture</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>HTTP-only cookies: {overview?.security.httpOnlySessionCookies ? "On" : "Off"}</p>
              <p>CSRF protection: {overview?.security.csrfProtection ? "On" : "Off"}</p>
              <p>Rate limiting: {overview?.security.rateLimiting ? "On" : "Off"}</p>
              <p>CORS restriction: {overview?.security.corsOriginRestriction ? "On" : "Off"}</p>
              <p>Admin-only mode: {overview?.security.adminOnlyAccess ? "Enabled" : "Disabled"}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Session hardening</p>
            <p className="mt-2 text-2xl font-bold">{overview?.security.sessionExpiryDays ?? 7} days</p>
            <p className="text-sm text-muted-foreground">Step-up verification window: {overview?.security.stepUpWindowMinutes ?? 15} min</p>
          </div>

          <Button
            onClick={() => void revokeSessions()}
            variant="destructive"
            className="w-full"
            disabled={actionBusy || loading}
          >
            {actionBusy ? "Revoking sessions…" : "Revoke all other sessions"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Paid access controls</h2>
        {accessSettings ? (
          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span>Require paid access overall</span>
              <input
                type="checkbox"
                checked={accessSettings.paidAccessEnabled}
                onChange={(event) =>
                  setAccessSettings({
                    ...accessSettings,
                    paidAccessEnabled: event.target.checked,
                  })
                }
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span>Require paid access to use AI features</span>
              <input
                type="checkbox"
                checked={accessSettings.aiAccessRestricted}
                onChange={(event) =>
                  setAccessSettings({
                    ...accessSettings,
                    aiAccessRestricted: event.target.checked,
                  })
                }
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span>Require paid access to use auto trading</span>
              <input
                type="checkbox"
                checked={accessSettings.autoTradeRestricted}
                onChange={(event) =>
                  setAccessSettings({
                    ...accessSettings,
                    autoTradeRestricted: event.target.checked,
                  })
                }
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span>Require paid access to use day trading</span>
              <input
                type="checkbox"
                checked={accessSettings.dayTradeRestricted}
                onChange={(event) =>
                  setAccessSettings({
                    ...accessSettings,
                    dayTradeRestricted: event.target.checked,
                  })
                }
              />
            </label>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">Monthly subscription price (USD)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={accessSettings.subscriptionMonthlyPriceUsd}
                  onChange={(event) =>
                    setAccessSettings({
                      ...accessSettings,
                      subscriptionMonthlyPriceUsd: Number(event.target.value || 0),
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>

              <Button onClick={() => void saveAccessSettings()} disabled={savingAccess} className="mt-6 md:mt-0">
                {savingAccess ? "Saving…" : "Save access settings"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Loading access controls…</p>
        )}
      </div>
    </div>
  );
}
