import { describe, it, expect, beforeAll } from "vitest";
import { vi } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// Neither the DB nor the AI client should ever be reached by an
// unauthenticated request — mock them so the modules can even be imported
// without a live environment, and so any accidental usage fails loudly.
vi.mock("@workspace/db", () => ({
  db: new Proxy({}, {
    get() {
      throw new Error("db must not be touched by unauthenticated requests");
    },
  }),
  brokerConnectionsTable: {},
  oandaConnectionsTable: {},
  autoTradeSettingsTable: {},
  autoTradeLogTable: {},
  autoTradeEventsTable: {},
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: new Proxy({}, {
    get() {
      throw new Error("anthropic must not be touched by unauthenticated requests");
    },
  }),
}));

vi.mock("../lib/credentialCrypto", () => ({
  encryptCredential: (v: string) => v,
  decryptCredential: (v: string) => v,
}));

let app: Express;

beforeAll(async () => {
  const tradesRouter = (await import("./trades")).default;
  const autoTradeRouter = (await import("./autoTrade")).default;

  app = express();
  app.use(express.json());
  // Same guard contract the real authMiddleware installs; no session cookie
  // means req.user stays undefined, so isAuthenticated() is false.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = function (this: Request) {
      return this.user != null;
    } as Request["isAuthenticated"];
    next();
  });
  app.use("/api", tradesRouter);
  app.use("/api", autoTradeRouter);
});

describe("unauthenticated requests are rejected with 401", () => {
  const cases: Array<{ method: "get" | "post" | "put"; path: string; body?: object }> = [
    { method: "get", path: "/api/trades" },
    { method: "post", path: "/api/trades", body: { symbol: "BTC", side: "buy", notional: 10 } },
    { method: "get", path: "/api/auto-trade/settings" },
    { method: "put", path: "/api/auto-trade/settings", body: { enabled: true } },
    { method: "get", path: "/api/auto-trade/stats" },
    { method: "post", path: "/api/auto-trade/run", body: {} },
    { method: "get", path: "/api/auto-trade/run-stream" },
    { method: "get", path: "/api/auto-trade/run-status" },
    { method: "get", path: "/api/auto-trade/log" },
    { method: "get", path: "/api/auto-trade/events" },
    { method: "get", path: "/api/auto-trade/pnl" },
    { method: "get", path: "/api/auto-trade/alerts" },
  ];

  for (const c of cases) {
    it(`${c.method.toUpperCase()} ${c.path} → 401`, async () => {
      let req = request(app)[c.method](c.path);
      if (c.body) req = req.send(c.body);
      const res = await req;
      expect(res.status).toBe(401);
      expect(res.body.error).toBeTruthy();
    });
  }
});
