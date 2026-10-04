import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  aiCredentialsTable,
  usersTable,
  notificationPrefsTable,
} from "@workspace/db";
import { UpdateNotificationPrefsBody } from "@workspace/api-zod";
import { encryptCredential } from "../lib/credentialCrypto";

const router: IRouter = Router();
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

function maskKey(value: string): string {
  return value.length <= 8
    ? "Configured"
    : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

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
        maskedKey: row ? maskKey(row.apiKey) : null,
      };
    }),
  });
});

router.put(
  "/account/ai-credentials/:provider",
  async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const provider = String(req.params.provider);
    const apiKey =
      typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!isAiProvider(provider) || apiKey.length < 10) {
      res
        .status(400)
        .json({ error: "A valid AI provider and API key are required" });
      return;
    }
    const encryptedKey = encryptCredential(apiKey);
    await db
      .insert(aiCredentialsTable)
      .values({ userId: req.user!.id, provider, apiKey: encryptedKey })
      .onConflictDoUpdate({
        target: [aiCredentialsTable.userId, aiCredentialsTable.provider],
        set: { apiKey: encryptedKey, updatedAt: new Date() },
      });
    res.json({ provider, configured: true, maskedKey: maskKey(apiKey) });
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
