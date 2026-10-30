import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const aiBudgetSettingsTable = pgTable("ai_budget_settings", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  monthlyLimitMicroUsd: bigint("monthly_limit_micro_usd", {
    mode: "number",
  }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const aiUsageMonthlyTable = pgTable(
  "ai_usage_monthly",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    spentMicroUsd: bigint("spent_micro_usd", { mode: "number" })
      .notNull()
      .default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_usage_monthly_user_month_idx").on(
      table.userId,
      table.usageMonth,
    ),
  ],
);

export const aiBudgetReservationsTable = pgTable(
  "ai_budget_reservations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    usageMonth: varchar("usage_month", { length: 7 }).notNull(),
    reservedMicroUsd: bigint("reserved_micro_usd", {
      mode: "number",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_budget_reservations_user_month_created_idx").on(
      table.userId,
      table.usageMonth,
      table.createdAt,
    ),
  ],
);
