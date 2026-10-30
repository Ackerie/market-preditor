import {
  pgTable,
  varchar,
  timestamp,
  integer,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const derivConnectionsTable = pgTable("deriv_connections", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  apiToken: varchar("api_token", { length: 500 }).notNull(),
  mode: varchar("mode", { length: 10 }).notNull().default("demo"),
  loginId: varchar("login_id", { length: 50 }).notNull().default(""),
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

export type DerivConnection = typeof derivConnectionsTable.$inferSelect;
