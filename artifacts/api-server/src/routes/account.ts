import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import {
  db,
  aiCredentialsTable,
  sessionsTable,
  usersTable,
  notificationPrefsTable,
} from "@workspace/db";
import { UpdateNotificationPrefsBody } from "@workspace/api-zod";
import { clearSession, verifyPassword } from "../lib/auth";
import {
  getAiBudgetStatus,
  saveAiMonthlyBudget,
} from "../lib/aiBudget";
import { getSharedAiReadiness } from "../lib/aiPricing";

const router: IRouter = Router();
const accountDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many account deletion attempts. Try again later." },
});
const AI_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
type AiProvider = (typeof AI_PROVIDERS)[number];

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function isAiProvider(value: string): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider);
}

router.delete(
  "/account",
  accountDeletionLimiter,
  async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;

    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const confirmation =
      typeof req.body?.confirmation === "string"
        ? req.body.confirmation
        : "";
    if (confirmation !== "DELETE") {
      res
        .status(400)
        .json({ error: 'Type "DELETE" to confirm account deletion' });
      return;
    }

    const userId = req.user!.id;
    const [user] = await db
      .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (
      !user?.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const deleted = await db.transaction(async (transaction) => {
      await transaction
        .delete(sessionsTable)
        .where(sql`${sessionsTable.sess}->'user'->>'id' = ${userId}`);
      const [deletedUser] = await transaction
        .delete(usersTable)
        .where(eq(usersTable.id, userId))
        .returning({ id: usersTable.id });
      return Boolean(deletedUser);
    });

    if (!deleted) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    await clearSession(res);
    res.json({ success: true });
  },
);

router.get("/account/ai-credentials", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const rows = await db
    .select({
      provider: aiCredentialsTable.provider,
      apiKey: aiCredentialsTable.apiKey,
    })
    .from(aiCredentialsTable)
    .where(eq(aiCredentialsTable.userId, req.user!.id));
  res.json({
    providers: AI_PROVIDERS.map((provider) => {
      const row = rows.find((candidate) => candidate.provider === provider);
      return {
        provider,
        configured: Boolean(row),
        maskedKey: row ? "Configured" : null,
      };
    }),
  });
});

router.get("/account/ai-budget", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const budget = await getAiBudgetStatus(req.user!.id);
  res.json({ ...budget, providers: getSharedAiReadiness() });
});

router.put("/account/ai-budget", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const monthlyBudgetUsd = Number(req.body?.monthlyBudgetUsd);
  if (
    !Number.isFinite(monthlyBudgetUsd) ||
    monthlyBudgetUsd < 1 ||
    monthlyBudgetUsd > 1_000_000
  ) {
    res.status(400).json({
      error: "Monthly AI budget must be between $1 and $1,000,000",
    });
    return;
  }
  await saveAiMonthlyBudget(req.user!.id, monthlyBudgetUsd);
  const budget = await getAiBudgetStatus(req.user!.id);
  res.json({ ...budget, providers: getSharedAiReadiness() });
});

router.put(
  "/account/ai-credentials/:provider",
  async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    res.status(410).json({
      error:
        "Personal AI keys are disabled. Shared provider keys are managed by the service operator.",
    });
  },
);

router.delete(
  "/account/ai-credentials/:provider",
  async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const provider = String(req.params.provider);
    if (!isAiProvider(provider)) {
      res.status(400).json({ error: "Unknown AI provider" });
      return;
    }
    await db
      .delete(aiCredentialsTable)
      .where(
        and(
          eq(aiCredentialsTable.userId, req.user!.id),
          eq(aiCredentialsTable.provider, provider),
        ),
      );
    res.json({ success: true });
  },
);

router.get("/account/notifications", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const [prefs] = await db
    .select()
    .from(notificationPrefsTable)
    .where(eq(notificationPrefsTable.userId, userId))
    .limit(1);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  res.json({
    autoTradeEmailAlerts: prefs?.autoTradeEmailAlerts ?? false,
    email: user?.email ?? null,
  });
});

router.put("/account/notifications", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const parsed = UpdateNotificationPrefsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  await db
    .insert(notificationPrefsTable)
    .values({ userId, autoTradeEmailAlerts: parsed.data.autoTradeEmailAlerts })
    .onConflictDoUpdate({
      target: notificationPrefsTable.userId,
      set: { autoTradeEmailAlerts: parsed.data.autoTradeEmailAlerts },
    });

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  res.json({
    autoTradeEmailAlerts: parsed.data.autoTradeEmailAlerts,
    email: user?.email ?? null,
  });
});

export default router;
