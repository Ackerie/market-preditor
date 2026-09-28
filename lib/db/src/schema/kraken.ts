import {
  pgTable,
  varchar,
  timestamp,
  integer,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const krakenConnectionsTable = pgTable("kraken_connections", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  apiKey: varchar("api_key", { length: 500 }).notNull(),
  apiSecret: varchar("api_secret", { length: 2000 }).notNull(),
  autoTradeEnabled: boolean("auto_trade_enabled").notNull().default(false),
  autoTradeMaxUsd: numeric("auto_trade_max_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("20"),
  autoTradeDailyLimitUsd: numeric("auto_trade_daily_limit_usd", {
    precision: 18,
    scale: 2,
  })
    .notNull()
    .default("100"),
  spentTodayUsd: numeric("spent_today_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  spendDate: varchar("spend_date", { length: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type KrakenConnection = typeof krakenConnectionsTable.$inferSelect;
