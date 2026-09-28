import { pgTable, serial, boolean, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const autoTradeSettingsTable = pgTable("auto_trade_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  riskLevel: text("risk_level").notNull().default("moderate"),
  maxTradeAmountUsd: numeric("max_trade_amount_usd", { precision: 18, scale: 2 }).notNull().default("500"),
  intervalMinutes: integer("interval_minutes").notNull().default(60),
  // "interval" | "continuous" | "scheduled"
  runMode: text("run_mode").notNull().default("interval"),
  // Only used when runMode = "scheduled" — "HH:MM" in 24h format
  scheduledTime: text("scheduled_time"),
  // comma-separated asset classes: "crypto,stock,forex,futures"
  assetClasses: text("asset_classes").notNull().default("crypto,stock,forex,futures,commodity"),
  lastRunAt: timestamp("last_run_at"),
  // Day-trading exit guards: when enabled, bot positions past these
  // thresholds are sold automatically at the start of each cycle.
  exitGuardsEnabled: boolean("exit_guards_enabled").notNull().default(false),
  takeProfitPct: numeric("take_profit_pct", { precision: 6, scale: 2 }),
  stopLossPct: numeric("stop_loss_pct", { precision: 6, scale: 2 }),
  // Day-trade bot: a separate AI-run intraday mode with its own toggle and
  // per-trade size. It analyzes candlestick data and owns the exit guards.
  dayTradeEnabled: boolean("day_trade_enabled").notNull().default(false),
  dayTradeMaxUsd: numeric("day_trade_max_usd", { precision: 18, scale: 2 }).notNull().default("200"),
  dayTradeLastRunAt: timestamp("day_trade_last_run_at"),
});

export const autoTradeLogTable = pgTable("auto_trade_log", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  decision: text("decision").notNull(),
  reasoning: text("reasoning").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  executed: boolean("executed").notNull().default(false),
  tradeId: integer("trade_id"),
  logoUrl: text("logo_url").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAutoTradeSettingsSchema = createInsertSchema(autoTradeSettingsTable).omit({ id: true });
export const insertAutoTradeLogSchema = createInsertSchema(autoTradeLogTable).omit({ id: true, createdAt: true });

export type InsertAutoTradeSettings = z.infer<typeof insertAutoTradeSettingsSchema>;
export type AutoTradeSettings = typeof autoTradeSettingsTable.$inferSelect;
export type AutoTradeLogEntry = typeof autoTradeLogTable.$inferSelect;
