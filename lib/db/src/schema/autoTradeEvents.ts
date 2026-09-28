import { pgTable, integer, varchar, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const autoTradeEventsTable = pgTable("auto_trade_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  broker: varchar("broker", { length: 10 }).notNull(),
  symbol: varchar("symbol", { length: 30 }).notNull(),
  side: varchar("side", { length: 4 }).notNull(),
  notionalUsd: numeric("notional_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  // executed | skipped | rejected
  outcome: varchar("outcome", { length: 10 }).notNull(),
  // daily_limit | no_position | broker_rejected | error | null
  reasonCode: varchar("reason_code", { length: 20 }),
  message: text("message"),
  // Fill details for executed trades (null for skips/rejections and legacy rows)
  quantity: numeric("quantity", { precision: 30, scale: 10 }),
  fillPrice: numeric("fill_price", { precision: 18, scale: 8 }),
  // Which bot placed the trade: "longterm" (auto-trade) | "daytrade"
  strategy: varchar("strategy", { length: 10 }).notNull().default("longterm"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutoTradeEvent = typeof autoTradeEventsTable.$inferSelect;
