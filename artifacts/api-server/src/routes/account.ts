import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable, usersTable, notificationPrefsTable } from "@workspace/db";
import { UpdateNotificationPrefsBody } from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

router.get("/account/profile", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  res.json({
    id: userId,
    email: user?.email ?? null,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    profileImageUrl: user?.profileImageUrl ?? null,
    phone: profile?.phone ?? null,
    dateOfBirth: profile?.dateOfBirth ?? null,
    address: profile?.address ?? null,
    city: profile?.city ?? null,
    state: profile?.state ?? null,
    country: profile?.country ?? null,
    postalCode: profile?.postalCode ?? null,
  });
});

router.put("/account/profile", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const { phone, dateOfBirth, address, city, state, country, postalCode } = req.body as Record<string, string | undefined>;

  await db
    .insert(userProfilesTable)
    .values({ userId, phone, dateOfBirth, address, city, state, country, postalCode })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: { phone, dateOfBirth, address, city, state, country, postalCode },
    });

  res.json({ success: true });
});

router.get("/account/notifications", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const [prefs] = await db.select().from(notificationPrefsTable).where(eq(notificationPrefsTable.userId, userId)).limit(1);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

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

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ autoTradeEmailAlerts: parsed.data.autoTradeEmailAlerts, email: user?.email ?? null });
});

export default router;
