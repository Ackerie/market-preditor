import {
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const autoTradeCycleLocksTable = pgTable("auto_trade_cycle_locks", {
  lockKey: varchar("lock_key", { length: 200 }).primaryKey(),
  ownerToken: varchar("owner_token", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const orderRequestsTable = pgTable(
  "order_requests",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    state: varchar("state", { length: 16 }).notNull().default("pending"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("order_requests_user_idempotency_idx").on(
      table.userId,
      table.idempotencyKey,
    ),
  ],
);
