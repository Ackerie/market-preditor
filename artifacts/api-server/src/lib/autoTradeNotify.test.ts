import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prefsRows: [] as any[],
  userRows: [] as any[],
  insertResults: [] as any[][],
  insertedValues: [] as any[],
  deleteCalls: [] as any[],
  sendEmail: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  let selectCall = 0;
  const db = {
    select: () => ({
      from: (_table: any) => ({
        where: (_w: any) => ({
          limit: async () => {
            selectCall++;
            // First select per notify call is prefs, second is user.
            return selectCall % 2 === 1 ? mocks.prefsRows : mocks.userRows;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        mocks.insertedValues.push(v);
        return {
          onConflictDoNothing: () => ({
            returning: async () => mocks.insertResults.shift() ?? [{ id: 1 }],
          }),
        };
      },
    }),
    delete: () => ({
      where: async (w: any) => {
        mocks.deleteCalls.push(w);
      },
    }),
  };
  return {
    db,
    usersTable: { id: "id", email: "email" },
    notificationPrefsTable: { userId: "userId", autoTradeEmailAlerts: "autoTradeEmailAlerts" },
    autoTradeNotificationsTable: { id: "id", userId: "userId", dedupeKey: "dedupeKey" },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: any[]) => ({ and: args }),
  eq: (...args: any[]) => ({ eq: args }),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./resendMail", () => ({
  sendEmail: mocks.sendEmail,
}));

import { notifyAutoTradeIssue, classifyNotification, buildDedupeKey } from "./autoTradeNotify";

function baseEvent(overrides: Partial<Parameters<typeof notifyAutoTradeIssue>[0]> = {}) {
  return {
    userId: "u1",
    broker: "alpaca" as const,
    symbol: "BTC",
    side: "buy" as const,
    notionalUsd: 100,
    outcome: "rejected" as const,
    reasonCode: "broker_rejected" as const,
    message: "Alpaca rejected the order: insufficient buying power",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.prefsRows = [{ userId: "u1", autoTradeEmailAlerts: true }];
  mocks.userRows = [{ id: "u1", email: "trader@example.com" }];
  mocks.insertResults = [];
  mocks.insertedValues = [];
  mocks.deleteCalls = [];
  mocks.sendEmail.mockReset();
  mocks.sendEmail.mockResolvedValue(true);
});

describe("classifyNotification", () => {
  it("classifies daily-limit skips as daily_limit", () => {
    expect(classifyNotification({ outcome: "skipped", reasonCode: "daily_limit" })).toBe("daily_limit");
  });
  it("classifies rejections (broker_rejected and error) as rejected", () => {
    expect(classifyNotification({ outcome: "rejected", reasonCode: "broker_rejected" })).toBe("rejected");
    expect(classifyNotification({ outcome: "rejected", reasonCode: "error" })).toBe("rejected");
  });
  it("ignores executed trades and no-position skips", () => {
    expect(classifyNotification({ outcome: "executed" })).toBeNull();
    expect(classifyNotification({ outcome: "skipped", reasonCode: "no_position" })).toBeNull();
  });
});

describe("buildDedupeKey", () => {
  it("keys by day, broker, and kind", () => {
    expect(buildDedupeKey("2026-07-18", "alpaca", "daily_limit")).toBe("2026-07-18:alpaca:daily_limit");
  });
});

describe("notifyAutoTradeIssue", () => {
  it("sends an email for a rejection when the user opted in", async () => {
    await notifyAutoTradeIssue(baseEvent());
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const arg = mocks.sendEmail.mock.calls[0][0];
    expect(arg.to).toBe("trader@example.com");
    expect(arg.subject).toContain("Alpaca rejected");
    expect(arg.text).toContain("insufficient buying power");
  });

  it("sends a daily-cap email for daily_limit skips", async () => {
    await notifyAutoTradeIssue(baseEvent({ outcome: "skipped", reasonCode: "daily_limit", message: "Daily limit of $50.00 reached" }));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].subject).toContain("daily auto-trade limit");
  });

  it("does nothing for executed or no-position events", async () => {
    await notifyAutoTradeIssue(baseEvent({ outcome: "executed", reasonCode: undefined }));
    await notifyAutoTradeIssue(baseEvent({ outcome: "skipped", reasonCode: "no_position" }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.insertedValues).toHaveLength(0);
  });

  it("does nothing when the user has not opted in", async () => {
    mocks.prefsRows = [{ userId: "u1", autoTradeEmailAlerts: false }];
    await notifyAutoTradeIssue(baseEvent());
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does nothing when the user has no prefs row at all", async () => {
    mocks.prefsRows = [];
    await notifyAutoTradeIssue(baseEvent());
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does nothing when the user has no email on file", async () => {
    mocks.userRows = [{ id: "u1", email: null }];
    await notifyAutoTradeIssue(baseEvent());
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("skips the send when the dedupe insert hits a conflict (already notified today)", async () => {
    mocks.insertResults = [[]];
    await notifyAutoTradeIssue(baseEvent());
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("reserves a dedupe key of day:broker:kind", async () => {
    await notifyAutoTradeIssue(baseEvent({ broker: "oanda", outcome: "skipped", reasonCode: "daily_limit" }));
    const day = new Date().toISOString().slice(0, 10);
    expect(mocks.insertedValues[0].dedupeKey).toBe(`${day}:oanda:daily_limit`);
  });

  it("releases the dedupe slot when the email send fails", async () => {
    mocks.sendEmail.mockResolvedValue(false);
    await notifyAutoTradeIssue(baseEvent());
    expect(mocks.deleteCalls).toHaveLength(1);
  });

  it("keeps the dedupe slot when the email send succeeds", async () => {
    await notifyAutoTradeIssue(baseEvent());
    expect(mocks.deleteCalls).toHaveLength(0);
  });

  it("never throws even if the db blows up", async () => {
    mocks.prefsRows = null as any; // forces a runtime error inside
    await expect(notifyAutoTradeIssue(baseEvent())).resolves.toBeUndefined();
  });
});
