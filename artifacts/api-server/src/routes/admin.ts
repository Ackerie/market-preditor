import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import {
  autoTradeSettingsTable,
  brokerConnectionsTable,
  passwordResetTokensTable,
  sessionsTable,
  usersTable,
  db,
} from "@workspace/db";
import {
  ensureAppAccessSettings,
  getAdminCredentials,
  getSessionId,
  isAdminIpAllowed,
  isFeatureAccessAllowed,
  recordAdminAudit,
} from "../lib/auth";
import { sendEmail } from "../lib/resendMail";

const router: IRouter = Router();

router.get("/app-access", async (req: Request, res: Response) => {
  const settings = await ensureAppAccessSettings();
  const featureAccess = {
    ai: await isFeatureAccessAllowed(req, "ai"),
    autoTrade: await isFeatureAccessAllowed(req, "autoTrade"),
    dayTrade: await isFeatureAccessAllowed(req, "dayTrade"),
  };

  res.json({
    ok: true,
    settings: {
      ...settings,
      subscriptionMonthlyPriceUsd: Number(settings.subscriptionMonthlyPriceUsd ?? 0),
    },
    featureAccess,
  });
});

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  if (!isAdminIpAllowed(req)) {
    await recordAdminAudit(req, req.user.id, "admin_ip_blocked", {
      path: req.originalUrl,
      message: "Blocked admin route from disallowed IP",
    });
    res.status(403).json({
      error: "This admin account is restricted to approved IP addresses.",
    });
    return false;
  }
  return true;
}

router.get("/admin/access-settings", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const settings = await ensureAppAccessSettings();
  res.json({ ok: true, settings: { ...settings, subscriptionMonthlyPriceUsd: Number(settings.subscriptionMonthlyPriceUsd ?? 0) } });
});

router.put("/admin/access-settings", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const payload = req.body as Record<string, unknown>;
  const paidAccessEnabled = payload.paidAccessEnabled === true;
  const aiAccessRestricted = payload.aiAccessRestricted === true;
  const autoTradeRestricted = payload.autoTradeRestricted === true;
  const dayTradeRestricted = payload.dayTradeRestricted === true;
  const subscriptionMonthlyPriceUsd = Number(payload.subscriptionMonthlyPriceUsd ?? 0);

  const existing = await db.execute(sql`SELECT * FROM app_access_settings LIMIT 1`);
  const row = existing.rows?.[0] as Record<string, any> | undefined;

  if (!row) {
    const created = await db.execute(sql`
      INSERT INTO app_access_settings (
        paid_access_enabled,
        ai_access_restricted,
        auto_trade_restricted,
        day_trade_restricted,
        subscription_monthly_price_usd,
        updated_at
      ) VALUES (
        ${paidAccessEnabled},
        ${aiAccessRestricted},
        ${autoTradeRestricted},
        ${dayTradeRestricted},
        ${subscriptionMonthlyPriceUsd.toFixed(2)},
        ${new Date()}
      )
      RETURNING *
    `);
    const createdRow = created.rows?.[0] as Record<string, any> | undefined;
    res.json({
      ok: true,
      settings: {
        ...createdRow,
        paidAccessEnabled: Boolean(createdRow?.paid_access_enabled),
        aiAccessRestricted: Boolean(createdRow?.ai_access_restricted),
        autoTradeRestricted: Boolean(createdRow?.auto_trade_restricted),
        dayTradeRestricted: Boolean(createdRow?.day_trade_restricted),
        subscriptionMonthlyPriceUsd: Number(createdRow?.subscription_monthly_price_usd ?? 0),
      },
    });
    return;
  }

  const updated = await db.execute(sql`
    UPDATE app_access_settings
    SET paid_access_enabled = ${paidAccessEnabled},
        ai_access_restricted = ${aiAccessRestricted},
        auto_trade_restricted = ${autoTradeRestricted},
        day_trade_restricted = ${dayTradeRestricted},
        subscription_monthly_price_usd = ${subscriptionMonthlyPriceUsd.toFixed(2)},
        updated_at = ${new Date()}
    WHERE id = ${row.id}
    RETURNING *
  `);
  const updatedRow = updated.rows?.[0] as Record<string, any> | undefined;

  res.json({
    ok: true,
    settings: {
      ...updatedRow,
      paidAccessEnabled: Boolean(updatedRow?.paid_access_enabled),
      aiAccessRestricted: Boolean(updatedRow?.ai_access_restricted),
      autoTradeRestricted: Boolean(updatedRow?.auto_trade_restricted),
      dayTradeRestricted: Boolean(updatedRow?.day_trade_restricted),
      subscriptionMonthlyPriceUsd: Number(updatedRow?.subscription_monthly_price_usd ?? 0),
    },
  });
});

router.get("/admin/overview", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const [userTotal, sessionTotal, brokerTotal, autoTradeTotal] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionsTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(brokerConnectionsTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(autoTradeSettingsTable)
      .where(eq(autoTradeSettingsTable.enabled, true)),
  ]);

  res.json({
    ok: true,
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      adminModeEnabled: Boolean(getAdminCredentials()),
    },
    stats: {
      totalUsers: Number(userTotal[0]?.count ?? 0),
      activeSessions: Number(sessionTotal[0]?.count ?? 0),
      brokerConnections: Number(brokerTotal[0]?.count ?? 0),
      autoTradeEnabledUsers: Number(autoTradeTotal[0]?.count ?? 0),
    },
    security: {
      httpOnlySessionCookies: true,
      csrfProtection: true,
      rateLimiting: true,
      corsOriginRestriction: true,
      adminOnlyAccess: Boolean(getAdminCredentials()),
      sessionExpiryDays: 7,
      stepUpWindowMinutes: 15,
    },
  });
});

router.get("/admin/users", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const paidAccessColumn = (usersTable as any).paidAccessEnabled;

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      createdAt: usersTable.createdAt,
      isAdmin: usersTable.isAdmin,
      paidAccessEnabled: paidAccessColumn,
      subscriptionExpiresAt: (usersTable as any).subscriptionExpiresAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json({
    ok: true,
    users: rows.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt?.toISOString() ?? null,
      isAdmin: Boolean(user.isAdmin),
      paidAccessEnabled: Boolean(user.paidAccessEnabled),
      subscriptionExpiresAt: user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toISOString() : null,
    })),
  });
});

async function sendUserPasswordReset(req: Request, userId: string) {
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user?.email) {
    return false;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await db.transaction(async (transaction) => {
    await transaction
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, user.id));
    await transaction.insert(passwordResetTokensTable).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  });

  const configuredAppUrl = process.env.APP_URL;
  const origin = configuredAppUrl ?? `${req.protocol}://${req.get("host")}`;
  const resetUrl = `${origin.replace(/\/$/, "")}/reset-password#token=${encodeURIComponent(rawToken)}`;
  const sent = await sendEmail({
    to: user.email,
    subject: "Reset your password",
    text: `Reset your password using this secure link: ${resetUrl}\n\nThis link expires in one hour.`,
    html: `<p>Reset your password by clicking the link below.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in one hour.</p>`,
  });

  if (!sent) {
    await db
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, user.id));
    return false;
  }

  return true;
}

router.patch("/admin/users/:id/access", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paidAccessEnabled = req.body?.paidAccessEnabled === true;
  const rawSubscriptionExpiresAt = req.body?.subscriptionExpiresAt ?? null;
  const subscriptionExpiresAt = rawSubscriptionExpiresAt
    ? new Date(rawSubscriptionExpiresAt as string)
    : null;

  const [user] = await db
    .select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.isAdmin) {
    res.status(403).json({ error: "Admin accounts keep permanent access control." });
    return;
  }

  const paidAccessColumn = (usersTable as any).paidAccessEnabled;

  const [updatedUser] = await db
    .update(usersTable)
    .set({
      paidAccessEnabled,
      subscriptionExpiresAt: Number.isNaN(subscriptionExpiresAt?.getTime()) ? null : subscriptionExpiresAt,
    } as any)
    .where(eq(usersTable.id, userId))
    .returning({
      id: usersTable.id,
      paidAccessEnabled: paidAccessColumn,
      subscriptionExpiresAt: (usersTable as any).subscriptionExpiresAt,
    });

  await recordAdminAudit(req, req.user!.id, "admin_user_access_updated", {
    targetUserId: userId,
    paidAccessEnabled,
    subscriptionExpiresAt: Number.isNaN(subscriptionExpiresAt?.getTime()) ? null : subscriptionExpiresAt?.toISOString() ?? null,
  });

  res.json({
    ok: true,
    paidAccessEnabled: Boolean(updatedUser?.paidAccessEnabled ?? paidAccessEnabled),
    subscriptionExpiresAt: updatedUser?.subscriptionExpiresAt ? new Date(updatedUser.subscriptionExpiresAt).toISOString() : null,
  });
});

router.patch("/admin/users/access/bulk", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const paidAccessEnabled = req.body?.paidAccessEnabled === true;

  const updated = await db
    .update(usersTable)
    .set({ paidAccessEnabled } as any)
    .where(eq(usersTable.isAdmin, false))
    .returning({ id: usersTable.id, paidAccessEnabled: (usersTable as any).paidAccessEnabled });

  await recordAdminAudit(req, req.user!.id, "admin_bulk_access_updated", {
    paidAccessEnabled,
    updatedUserCount: updated.length,
  });

  res.json({
    ok: true,
    updatedUserCount: updated.length,
    paidAccessEnabled,
  });
});

router.post("/admin/users/:id/reset-password", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const sent = await sendUserPasswordReset(req, user.id);
  if (!sent) {
    res.status(500).json({ error: "Unable to send reset email" });
    return;
  }

  await recordAdminAudit(req, req.user!.id, "admin_user_password_reset", {
    targetUserId: user.id,
    targetEmail: user.email,
  });

  res.json({ ok: true, message: "Password reset email sent successfully." });
});

router.delete("/admin/users/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (userId === req.user!.id) {
    res.status(400).json({ error: "You cannot remove your own admin session." });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.isAdmin) {
    res.status(403).json({ error: "Admin accounts cannot be removed from this panel." });
    return;
  }

  const deleted = await db
    .delete(usersTable)
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id });

  if (!deleted.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await recordAdminAudit(req, req.user!.id, "admin_user_deleted", {
    deletedUserId: user.id,
  });

  res.json({ ok: true, deleted: true });
});

router.post("/admin/sessions/revoke", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const currentSession = getSessionId(req);
  const result = currentSession
    ? await db
        .delete(sessionsTable)
        .where(sql`${sessionsTable.sid} <> ${currentSession}`)
    : await db.delete(sessionsTable);

  res.json({
    ok: true,
    success: true,
    revokedOtherSessions: true,
    affectedRows: result?.rowCount ?? 0,
  });
});

export default router;
