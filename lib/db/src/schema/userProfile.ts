import { pgTable, varchar, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const userProfilesTable = pgTable("user_profiles", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 20 }),
  dateOfBirth: varchar("date_of_birth", { length: 10 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserProfile = typeof userProfilesTable.$inferSelect;
