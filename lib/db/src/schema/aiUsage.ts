import { sql } from "drizzle-orm";
import { integer, pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const aiUsageDailyTable = pgTable(
  "ai_usage_daily",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    usageDate: varchar("usage_date", { length: 10 }).notNull(),
    requestCount: integer("request_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("ai_usage_daily_user_provider_date_idx").on(
      table.userId,
      table.provider,
      table.usageDate,
    ),
  ],
);

export const incrementAiUsageSql = (requestCount: unknown, limit: number) =>
  sql`${requestCount} + 1 < ${limit}`;
