import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

let schemaInitializationPromise: Promise<void> | null = null;

export async function ensureDatabaseSchema(): Promise<void> {
  if (schemaInitializationPromise) {
    await schemaInitializationPromise;
    return;
  }

  schemaInitializationPromise = (async () => {
    const statements = [
      `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
      `CREATE TABLE IF NOT EXISTS "sessions" (
        "sid" varchar PRIMARY KEY,
        "sess" jsonb NOT NULL,
        "expire" timestamp NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");`,
      `CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL UNIQUE,
        "password_hash" varchar,
        "first_name" varchar,
        "last_name" varchar,
        "profile_image_url" varchar,
        "is_admin" boolean NOT NULL DEFAULT false,
        "paid_access_enabled" boolean NOT NULL DEFAULT false,
        "subscription_expires_at" timestamp with time zone,
        "two_factor_enabled" boolean NOT NULL DEFAULT false,
        "two_factor_secret" varchar,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      );`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paid_access_enabled" boolean NOT NULL DEFAULT false;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_expires_at" timestamp with time zone;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean NOT NULL DEFAULT false;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_secret" varchar;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_image_url" varchar;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" varchar;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" varchar;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" varchar;`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();`,
      `CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "action" varchar NOT NULL,
        "details" jsonb DEFAULT '{}',
        "ip_address" varchar,
        "user_agent" varchar,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );`,
      `CREATE TABLE IF NOT EXISTS "app_access_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "paid_access_enabled" boolean NOT NULL DEFAULT true,
        "ai_access_restricted" boolean NOT NULL DEFAULT true,
        "auto_trade_restricted" boolean NOT NULL DEFAULT true,
        "day_trade_restricted" boolean NOT NULL DEFAULT true,
        "subscription_monthly_price_usd" numeric NOT NULL DEFAULT '0',
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      );`,
      `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "token_hash" varchar NOT NULL UNIQUE,
        "expires_at" timestamp with time zone NOT NULL,
        "used_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      );`,
      `CREATE INDEX IF NOT EXISTS "IDX_password_reset_tokens_user" ON "password_reset_tokens" ("user_id");`,
    ];

    for (const statement of statements) {
      await pool.query(statement);
    }
  })();

  await schemaInitializationPromise;
}

await ensureDatabaseSchema();

export * from "./schema";
