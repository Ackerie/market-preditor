import { pgTable, integer, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const notificationPrefsTable = pgTable("notification_prefs", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  autoTradeEmailAlerts: boolean("auto_trade_email_alerts").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// One row per notification actually sent — the unique (userId, dedupeKey)
// constraint is what guarantees at-most-one email per cap-hit/rejection per day.
export const autoTradeNotificationsTable = pgTable(
  "auto_trade_notifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // e.g. "2026-07-18:alpaca:daily_limit"
    dedupeKey: varchar("dedupe_key", { length: 80 }).notNull(),
    broker: varchar("broker", { length: 10 }).notNull(),
    // daily_limit | rejected
    kind: varchar("kind", { length: 20 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("auto_trade_notifications_user_dedupe_idx").on(table.userId, table.dedupeKey)],
);

export type NotificationPrefs = typeof notificationPrefsTable.$inferSelect;
export type AutoTradeNotification = typeof autoTradeNotificationsTable.$inferSelect;
