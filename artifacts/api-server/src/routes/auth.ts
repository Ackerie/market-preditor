import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import {
  db,
  passwordResetTokensTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import crypto from "node:crypto";
import { sendEmail } from "../lib/resendMail";
import {
  clearSession,
  createSession,
  getSession,
  getSessionId,
  hashPassword,
  SESSION_COOKIE,
  SESSION_TTL,
  STEP_UP_TTL,
  updateSession,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

export function getCookieOptions(req: Request) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0].trim()
      : req.secure
        ? "https"
        : "http";

  return {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "strict" as const,
    path: "/",
  };
}

function setSessionCookie(req: Request, res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    ...getCookieOptions(req),
    maxAge: SESSION_TTL,
  });
}

function getCredentials(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const email =
    typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const password = typeof value.password === "string" ? value.password : "";
  const confirmPassword =
    typeof value.confirmPassword === "string" ? value.confirmPassword : "";
  const firstName =
    typeof value.firstName === "string" ? value.firstName.trim() : "";
  const lastName =
    typeof value.lastName === "string" ? value.lastName.trim() : "";

  if (!email || !password) return null;
  return { email, password, confirmPassword, firstName, lastName };
}

async function startSession(
  req: Request,
  res: Response,
  user: typeof usersTable.$inferSelect,
) {
  const sid = await createSession({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL / 1000,
    reauthenticated_at: Date.now(),
  });
  setSessionCookie(req, res, sid);
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post("/auth/register", async (req: Request, res: Response) => {
  const credentials = getCredentials(req.body);
  if (!credentials || credentials.password.length < 8) {
    res.status(400).json({
      error: "Email and a password of at least 8 characters are required",
    });
    return;
  }
  if (credentials.password !== credentials.confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, credentials.email));
  if (existingUser) {
    res
      .status(409)
      .json({ error: "An account with that email already exists" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      email: credentials.email,
      passwordHash: await hashPassword(credentials.password),
      firstName: credentials.firstName || null,
      lastName: credentials.lastName || null,
    })
    .returning();

  await startSession(req, res, user);
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
  });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const credentials = getCredentials(req.body);
  if (!credentials) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, credentials.email));
  const valid = user?.passwordHash
    ? await verifyPassword(credentials.password, user.passwordHash)
    : false;

  if (!user || !valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  await startSession(req, res, user);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
  });
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  await clearSession(res, getSessionId(req));
  res.json({ success: true });
});

router.post("/auth/reauthenticate", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));
  if (
    !user?.passwordHash ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const sid = getSessionId(req);
  if (sid) {
    const session = await getSession(sid);
    if (session) {
      await updateSession(sid, { ...session, reauthenticated_at: Date.now() });
    }
  }
  res.json({ success: true, validForMs: STEP_UP_TTL });
});

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const genericResponse = {
    message: "If an account exists for that email, a reset link has been sent.",
  };

  if (!email) {
    res.json(genericResponse);
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (!user) {
    res.json(genericResponse);
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await db
    .delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, user.id));
  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const configuredAppUrl = process.env.APP_URL;
  if (process.env.NODE_ENV === "production" && !configuredAppUrl) {
    await db
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, user.id));
    res.json(genericResponse);
    return;
  }
  const origin = configuredAppUrl ?? `${req.protocol}://${req.get("host")}`;
  const resetUrl = `${origin.replace(/\/$/, "")}/reset-password#token=${encodeURIComponent(rawToken)}`;
  const sent = await sendEmail({
    to: user.email,
    subject: "Reset your NexusTrade password",
    text: `Reset your NexusTrade password using this link: ${resetUrl}\n\nThis link expires in one hour.`,
    html: `<p>Reset your NexusTrade password by clicking the link below.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in one hour.</p>`,
  });

  if (!sent) {
    await db
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, user.id));
  }

  res.json(genericResponse);
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const confirmPassword =
    typeof req.body?.confirmPassword === "string"
      ? req.body.confirmPassword
      : "";
  if (!token || password.length < 8) {
    res.status(400).json({
      error: "A reset token and password of at least 8 characters are required",
    });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const passwordHash = await hashPassword(password);
  const consumed = await db.transaction(async (transaction) => {
    const [resetToken] = await transaction
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ),
      )
      .returning({
        id: passwordResetTokensTable.id,
        userId: passwordResetTokensTable.userId,
      });
    if (!resetToken) return false;

    await transaction
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, resetToken.userId));
    await transaction
      .delete(sessionsTable)
      .where(sql`${sessionsTable.sess}->'user'->>'id' = ${resetToken.userId}`);
    return true;
  });

  if (!consumed) {
    res.status(400).json({ error: "This reset link is invalid or expired" });
    return;
  }

  res.json({ message: "Password reset successfully" });
});

router.get("/logout", async (req: Request, res: Response) => {
  await clearSession(res, getSessionId(req));
  res.redirect("/login");
});

export default router;
