import crypto from "node:crypto";
import { promisify } from "node:util";
import { type Request, type Response } from "express";
import {
  adminAuditLogsTable,
  db,
  ensureDatabaseSchema,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface SessionUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean;
  paidAccessEnabled: boolean;
  subscriptionExpiresAt?: string | null;
}

export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
export const STEP_UP_TTL = 15 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);

function secureCompare(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  } catch {
    return false;
  }
}

export function getAdminCredentials(): {
  email: string;
  password: string;
} | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export function isAdminCredentials(email: string, password: string): boolean {
  const admin = getAdminCredentials();
  if (!admin) return false;

  return (
    secureCompare(email.trim().toLowerCase(), admin.email) &&
    secureCompare(password, admin.password)
  );
}

export function getAdminTwoFactorSecret(): string | null {
  const secret = process.env.ADMIN_2FA_SECRET?.trim();
  return secret ? secret : null;
}

export function getAdminAllowedIps(): string[] {
  return (process.env.ADMIN_ALLOWED_IPS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getRequestIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function isAdminIpAllowed(req: Request): boolean {
  const allowedIps = getAdminAllowedIps();
  if (allowedIps.length === 0) return true;
  const requestIp = getRequestIp(req);
  return allowedIps.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\s+/g, "");
    return normalizedAllowed === requestIp || allowed === "0.0.0.0/0";
  });
}

function base32ToBuffer(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/g, "").toUpperCase();
  let bits = "";

  for (const char of cleaned) {
    const value = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, "0");
  }

  const length = Math.floor(bits.length / 8) * 8;
  const bytes = Buffer.alloc(Math.ceil(length / 8));
  for (let index = 0; index < length; index += 8) {
    bytes[index / 8] = Number.parseInt(bits.slice(index, index + 8), 2);
  }
  return bytes;
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!secret || !code) return false;
  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== 6) return false;

  const key = base32ToBuffer(secret);
  const timeWindow = Math.floor(Date.now() / 30000);

  for (let delta = -1; delta <= 1; delta += 1) {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(0, 0);
    counterBuffer.writeUInt32BE(timeWindow + delta, 4);

    const digest = crypto.createHmac("sha1", key).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0xf;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    const expected = String(binary % 1000000).padStart(6, "0");
    if (expected === normalized) return true;
  }

  return false;
}

export async function recordAdminAudit(
  req: Request,
  userId: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(adminAuditLogsTable).values({
    userId,
    action,
    details: details as Record<string, unknown>,
    ipAddress: getRequestIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
}

export async function ensureBootstrapAdmin(): Promise<boolean> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    return false;
  }

  try {
    const [existingUser] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        isAdmin: usersTable.isAdmin,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existingUser) {
      if (!existingUser.isAdmin) {
        await db
          .update(usersTable)
          .set({ isAdmin: true })
          .where(eq(usersTable.id, existingUser.id));
      }
      return true;
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: await hashPassword(password),
        firstName: "Admin",
        lastName: "Operator",
        isAdmin: true,
      })
      .returning({ id: usersTable.id, isAdmin: usersTable.isAdmin });

    return Boolean(created?.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /column .* does not exist|relation .* does not exist/i.test(message) ||
      /missing column|undefined column/i.test(message)
    ) {
      await ensureDatabaseSchema();
      return ensureBootstrapAdmin();
    }

    throw error;
  }
}

export async function ensureAppAccessSettings() {
  const existing = await db.execute(sql`SELECT * FROM app_access_settings LIMIT 1`);
  const settings = (existing.rows?.[0] as Record<string, any> | undefined) ?? null;

  if (settings) {
    const isLegacyDefault =
      settings.paid_access_enabled !== true &&
      settings.ai_access_restricted !== true &&
      settings.auto_trade_restricted !== true &&
      settings.day_trade_restricted !== true &&
      (settings.subscription_monthly_price_usd ?? "0") === "0";

    if (isLegacyDefault) {
      const updated = await db.execute(sql`
        UPDATE app_access_settings
        SET paid_access_enabled = true,
            ai_access_restricted = true,
            auto_trade_restricted = true,
            day_trade_restricted = true,
            updated_at = ${new Date()}
        WHERE id = ${settings.id}
        RETURNING *
      `);

      return (updated.rows?.[0] as Record<string, any>) ?? settings;
    }

    return {
      id: settings.id,
      paidAccessEnabled: Boolean(settings.paid_access_enabled),
      aiAccessRestricted: Boolean(settings.ai_access_restricted),
      autoTradeRestricted: Boolean(settings.auto_trade_restricted),
      dayTradeRestricted: Boolean(settings.day_trade_restricted),
      subscriptionMonthlyPriceUsd: String(settings.subscription_monthly_price_usd ?? "0"),
      updatedAt: settings.updated_at ? new Date(settings.updated_at) : new Date(),
    };
  }

  const created = await db.execute(sql`
    INSERT INTO app_access_settings (
      paid_access_enabled,
      ai_access_restricted,
      auto_trade_restricted,
      day_trade_restricted,
      subscription_monthly_price_usd,
      updated_at
    ) VALUES (
      true,
      true,
      true,
      true,
      '0',
      ${new Date()}
    )
    RETURNING *
  `);

  const createdRow = (created.rows?.[0] as Record<string, any> | undefined) ?? null;

  return createdRow ?? {
    id: "",
    paidAccessEnabled: true,
    aiAccessRestricted: true,
    autoTradeRestricted: true,
    dayTradeRestricted: true,
    subscriptionMonthlyPriceUsd: "0",
    updatedAt: new Date(),
  };
}

export async function getAppAccessSettings() {
  return ensureAppAccessSettings();
}

export async function isFeatureAccessAllowed(
  req: Request,
  feature: "ai" | "autoTrade" | "dayTrade",
): Promise<boolean> {
  const settings = await getAppAccessSettings();
  if (!settings.paidAccessEnabled) {
    return true;
  }
  if (req.user?.isAdmin) {
    return true;
  }

  const subscriptionExpiresAt = req.user?.subscriptionExpiresAt
    ? new Date(req.user.subscriptionExpiresAt)
    : null;
  const hasActiveSubscription =
    req.user?.paidAccessEnabled === true ||
    (subscriptionExpiresAt && !Number.isNaN(subscriptionExpiresAt.getTime()) && subscriptionExpiresAt.getTime() > Date.now());

  if (hasActiveSubscription) {
    return true;
  }

  if (feature === "ai" && settings.aiAccessRestricted) return false;
  if (feature === "autoTrade" && settings.autoTradeRestricted) return false;
  if (feature === "dayTrade" && settings.dayTradeRestricted) return false;
  return true;
}

export async function anyAdminUserExists(): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true));

  return Number(row?.count ?? 0) > 0;
}

export interface SessionData {
  user: SessionUser;
  expires_at: number;
  reauthenticated_at?: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, salt, storedKey] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !storedKey) return false;

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const expectedKey = Buffer.from(storedKey, "hex");
  return (
    derivedKey.length === expectedKey.length &&
    crypto.timingSafeEqual(derivedKey, expectedKey)
  );
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(
  res: Response,
  sid?: string,
  req?: Request,
): Promise<void> {
  if (sid) await deleteSession(sid);

  const forwardedProto = req?.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : req?.secure
        ? "https"
        : "http";

  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: protocol === "https" || process.env.NODE_ENV === "production",
  });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}

export async function hasRecentAuthentication(req: Request): Promise<boolean> {
  const sid = getSessionId(req);
  if (!sid) return false;
  const session = await getSession(sid);
  return Boolean(
    session?.reauthenticated_at &&
    Date.now() - session.reauthenticated_at <= STEP_UP_TTL,
  );
}
