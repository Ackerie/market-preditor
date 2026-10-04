import crypto from "node:crypto";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { hasRecentAuthentication } from "./lib/auth";

const app: Express = express();

// Trust exactly one reverse proxy so secure cookies work correctly behind TLS
// termination without trusting arbitrary client-supplied forwarding headers.
app.set("trust proxy", 1);

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

const configuredOrigins = [
  process.env.APP_URL,
  ...(process.env.CORS_ORIGINS?.split(",") ?? []),
]
  .filter((origin): origin is string => Boolean(origin?.trim()))
  .map((origin) => normalizeOrigin(origin.trim()));

if (process.env.NODE_ENV === "production" && configuredOrigins.length === 0) {
  throw new Error("APP_URL or CORS_ORIGINS must be configured in production");
}

const allowedOrigins = new Set(
  configuredOrigins.length > 0 ? configuredOrigins : ["http://localhost:5173"],
);

app.use(helmet());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed"));
    },
  }),
);
app.use(cookieParser());

const CSRF_COOKIE = "XSRF-TOKEN";
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.use((req, res, next) => {
  let csrfToken = req.cookies?.[CSRF_COOKIE];
  if (typeof csrfToken !== "string" || csrfToken.length < 32) {
    csrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: req.secure,
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  if (mutatingMethods.has(req.method) && req.cookies?.sid) {
    const supplied = req.get("x-csrf-token") ?? "";
    const expected = Buffer.from(csrfToken);
    const received = Buffer.from(supplied);
    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      res.status(403).json({ error: "CSRF validation failed" });
      return;
    }
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});
const expensiveActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again shortly." },
});
const sensitiveActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sensitive actions. Try again later." },
});
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many order attempts. Try again shortly." },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/predictions", expensiveActionLimiter);
app.use("/api/auto-trade/run", expensiveActionLimiter);
app.use("/api/auto-trade/run-stream", expensiveActionLimiter);
app.use("/api/broker/orders", expensiveActionLimiter);
app.use("/api/trades", orderLimiter);
app.use("/api/broker/connect", sensitiveActionLimiter);
app.use("/api/broker/oanda/connect", sensitiveActionLimiter);
app.use("/api/broker/kraken/connect", sensitiveActionLimiter);
app.use("/api/broker/auto-trade", sensitiveActionLimiter);
app.use("/api/broker/oanda/auto-trade", sensitiveActionLimiter);
app.use("/api/broker/kraken/auto-trade", sensitiveActionLimiter);
app.use("/api/account/ai-credentials", sensitiveActionLimiter);
app.use("/api/auto-trade/settings", sensitiveActionLimiter);

// Cookie-authenticated state changes must come from the configured app origin.
// Requests without a session cookie may still use bearer auth or server-to-server auth.
app.use((req, res, next) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const origin = req.get("origin");
  if (mutating && req.cookies?.sid && origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: "Cross-origin request rejected" });
    return;
  }
  next();
});
app.use(authMiddleware);

const stepUpPrefixes = [
  "/api/trades",
  "/api/broker/connect",
  "/api/broker/oanda/connect",
  "/api/broker/kraken/connect",
  "/api/broker/orders",
  "/api/broker/auto-trade",
  "/api/broker/oanda/auto-trade",
  "/api/broker/kraken/auto-trade",
  "/api/account/ai-credentials",
  "/api/auto-trade/settings",
  "/api/auto-trade/run",
  "/api/auto-trade/run-stream",
];

app.use(async (req, res, next) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const sensitive = stepUpPrefixes.some((prefix) =>
    req.path.startsWith(prefix),
  );
  if (
    mutating &&
    sensitive &&
    req.isAuthenticated() &&
    !(await hasRecentAuthentication(req))
  ) {
    res.status(428).json({
      error: "Recent password verification required",
      code: "STEP_UP_REQUIRED",
    });
    return;
  }
  next();
});

app.use("/api", router);

export default app;
