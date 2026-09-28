import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

vi.mock("./resendMail", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { db, pool, usersTable, notificationPrefsTable, autoTradeNotificationsTable } from "@workspace/db";
import { notifyAutoTradeIssue } from "./autoTradeNotify";

const TEST_EMAIL = "autotrade-notify-itest@example.com";
let userId: string;

function rejectionEvent(overrides: Partial<Parameters<typeof notifyAutoTradeIssue>[0]> = {}) {
  return {
    userId,
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

async function clearNotifications() {
  await db.delete(autoTradeNotificationsTable).where(eq(autoTradeNotificationsTable.userId, userId));
}

beforeAll(async () => {
  // Idempotent test-user setup (unique email keeps this isolated from real data).
  await db.delete(usersTable).where(eq(usersTable.email, TEST_EMAIL));
  const [user] = await db.insert(usersTable).values({ email: TEST_EMAIL }).returning({ id: usersTable.id });
  userId = user.id;
  await db.insert(notificationPrefsTable).values({ userId, autoTradeEmailAlerts: true });
});

afterAll(async () => {
  // Cascades to notification_prefs and auto_trade_notifications.
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await pool.end();
});

beforeEach(async () => {
  await clearNotifications();
  mocks.sendEmail.mockReset();
  mocks.sendEmail.mockResolvedValue(true);
});

describe("notifyAutoTradeIssue (integration, real Postgres)", () => {
  it("sends exactly one email when many concurrent rejections race for the same dedupe key", async () => {
    await Promise.all(Array.from({ length: 25 }, () => notifyAutoTradeIssue(rejectionEvent())));

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    const rows = await db
      .select()
      .from(autoTradeNotificationsTable)
      .where(eq(autoTradeNotificationsTable.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("rejected");
    expect(rows[0].broker).toBe("alpaca");
  });

  it("keeps different dedupe keys independent under a mixed concurrent burst", async () => {
    const events = [
      ...Array.from({ length: 10 }, () => rejectionEvent()),
      ...Array.from({ length: 10 }, () => rejectionEvent({ broker: "oanda" as const })),
      ...Array.from({ length: 10 }, () =>
        rejectionEvent({ outcome: "skipped" as const, reasonCode: "daily_limit" as const, message: "Daily limit reached" }),
      ),
    ];
    await Promise.all(events.map((e) => notifyAutoTradeIssue(e)));

    // One per (broker, kind): alpaca/rejected, oanda/rejected, alpaca/daily_limit.
    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
    const rows = await db
      .select()
      .from(autoTradeNotificationsTable)
      .where(eq(autoTradeNotificationsTable.userId, userId));
    expect(rows.map((r) => `${r.broker}:${r.kind}`).sort()).toEqual([
      "alpaca:daily_limit",
      "alpaca:rejected",
      "oanda:rejected",
    ]);
  });

  it("retries after a failed send: the slot is released and the next event delivers the email", async () => {
    mocks.sendEmail.mockResolvedValueOnce(false);

    await notifyAutoTradeIssue(rejectionEvent());
    // Failed send must not leave a reservation behind.
    let rows = await db
      .select()
      .from(autoTradeNotificationsTable)
      .where(eq(autoTradeNotificationsTable.userId, userId));
    expect(rows).toHaveLength(0);

    await notifyAutoTradeIssue(rejectionEvent());
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    rows = await db
      .select()
      .from(autoTradeNotificationsTable)
      .where(eq(autoTradeNotificationsTable.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("after a failed send, a concurrent retry burst still results in exactly one delivered email", async () => {
    mocks.sendEmail.mockResolvedValueOnce(false);
    await notifyAutoTradeIssue(rejectionEvent());

    await Promise.all(Array.from({ length: 15 }, () => notifyAutoTradeIssue(rejectionEvent())));

    // 1 failed attempt + exactly 1 successful retry.
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    const rows = await db
      .select()
      .from(autoTradeNotificationsTable)
      .where(eq(autoTradeNotificationsTable.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("does not send again once a notification for the key has been delivered", async () => {
    await notifyAutoTradeIssue(rejectionEvent());
    await notifyAutoTradeIssue(rejectionEvent());
    await notifyAutoTradeIssue(rejectionEvent());
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });
});
