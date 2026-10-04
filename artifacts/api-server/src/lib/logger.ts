import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "req.body.password",
    "req.body.confirmPassword",
    "req.body.token",
    "req.body.apiKey",
    "req.body.apiSecret",
    "req.body.apiToken",
    "req.body.accessToken",
    "req.body.secret",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
