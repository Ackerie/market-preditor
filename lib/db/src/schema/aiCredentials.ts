import { sql } from "drizzle-orm";
import { pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const aiCredentialsTable = pgTable(
  "ai_credentials",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    apiKey: varchar("api_key", { length: 2000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_credentials_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
  ],
);

export type AiCredential = typeof aiCredentialsTable.$inferSelect;
