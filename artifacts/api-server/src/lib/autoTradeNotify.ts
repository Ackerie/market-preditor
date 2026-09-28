import { and, eq } from "drizzle-orm";
import { db, usersTable, notificationPrefsTable, autoTradeNotificationsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendEmail } from "./resendMail";
import { getBroker } from "./brokers";

export interface AutoTradeNotifyEvent {
  userId: string;
  broker: string;
  symbol: string;
  side: "buy" | "sell";
  notionalUsd: number;
  outcome: "executed" | "skipped" | "rejected";
  reasonCode?: "daily_limit" | "no_position" | "broker_rejected" | "insufficient_cash" | "market_closed" | "not_tradeable" | "too_small" | "wash_trade" | "error";
  message?: string;
}

function brokerLabel(id: string): string {
  return getBroker(id)?.displayName ?? id;
}

/**
 * Decide which notification kind (if any) an auto-trade event warrants.
 * Only daily-cap hits and broker rejections/errors trigger emails —
 * "no position" skips are routine and would be noise.
 */
export function classifyNotification(event: Pick<AutoTradeNotifyEvent, "outcome" | "reasonCode">): "daily_limit" | "rejected" | null {
  if (event.outcome === "skipped" && event.reasonCode === "daily_limit") return "daily_limit";
  if (event.outcome === "rejected") return "rejected";
  return null;
}

/** One email per user, per broker, per kind, per UTC day. */
export function buildDedupeKey(day: string, broker: string, kind: string): string {
  return `${day}:${broker}:${kind}`;
}

function buildEmailContent(event: AutoTradeNotifyEvent, kind: "daily_limit" | "rejected") {
  const broker = brokerLabel(event.broker);
  const detail = event.message ?? "";
  if (kind === "daily_limit") {
    return {
      subject: `NexusTrade: daily auto-trade limit reached on ${broker}`,
      text: `Your auto-trader hit its daily spending limit on ${broker}. No further automated trades will be placed today.\n\n${detail}\n\nYou can adjust your daily limit anytime under Account → Connections.`,
      html: `<p>Your auto-trader hit its <strong>daily spending limit</strong> on ${broker}. No further automated trades will be placed today.</p><p>${detail}</p><p>You can adjust your daily limit anytime under <em>Account → Connections</em>.</p>`,
    };
  }
  return {
    subject: `NexusTrade: ${broker} rejected an auto-trade order`,
    text: `An automated ${event.side} order for ${event.symbol} on ${broker} could not be placed.\n\n${detail}\n\nFurther rejections today on ${broker} will not trigger additional emails. Check the Auto-Trade activity feed in the app for full details.`,
    html: `<p>An automated <strong>${event.side}</strong> order for <strong>${event.symbol}</strong> on ${broker} could not be placed.</p><p>${detail}</p><p>Further rejections today on ${broker} will not trigger additional emails. Check the Auto-Trade activity feed in the app for full details.</p>`,
  };
}

/**
 * Send an out-of-app email for a rejected or daily-cap auto-trade event,
 * if the user opted in. Deduplicated to one email per user/broker/kind/day
 * via a unique-constrained insert; the reservation row is removed if the
 * send fails so a later event can retry.
 */
export async function notifyAutoTradeIssue(event: AutoTradeNotifyEvent): Promise<void> {
  try {
    const kind = classifyNotification(event);
    if (!kind) return;

    const [prefs] = await db
      .select()
      .from(notificationPrefsTable)
      .where(eq(notificationPrefsTable.userId, event.userId))
      .limit(1);
    if (!prefs?.autoTradeEmailAlerts) return;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, event.userId)).limit(1);
    if (!user?.email) return;

    const day = new Date().toISOString().slice(0, 10);
    const dedupeKey = buildDedupeKey(day, event.broker, kind);

    // Atomically reserve the notification slot — only the first event of the
    // day for this user/broker/kind gets a row back.
    const inserted = await db
      .insert(autoTradeNotificationsTable)
      .values({ userId: event.userId, dedupeKey, broker: event.broker, kind })
      .onConflictDoNothing()
      .returning({ id: autoTradeNotificationsTable.id });
    if (inserted.length === 0) return;

    const content = buildEmailContent(event, kind);
    const sent = await sendEmail({ to: user.email, ...content });

    if (!sent) {
      // Release the slot so a later event today can retry the notification.
      await db
        .delete(autoTradeNotificationsTable)
        .where(and(eq(autoTradeNotificationsTable.userId, event.userId), eq(autoTradeNotificationsTable.dedupeKey, dedupeKey)));
      return;
    }

    logger.info({ userId: event.userId, broker: event.broker, kind }, "Auto-trade alert email sent");
  } catch (err) {
    logger.error({ err, userId: event.userId }, "Failed to send auto-trade alert notification");
  }
}
