import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url").notNull().default(""),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type WatchlistEntry = typeof watchlistTable.$inferSelect;
