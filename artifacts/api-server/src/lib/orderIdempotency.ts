import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, orderRequestsTable } from "@workspace/db";

export type OrderIdempotencyResult =
  | { kind: "started" }
  | { kind: "replay"; status: number; body: Record<string, unknown> }
  | { kind: "conflict" }
  | { kind: "in_progress" };

export function isValidIdempotencyKey(key: string | undefined): key is string {
  return Boolean(
    key &&
    key.length >= 16 &&
    key.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(key),
  );
}

export function hashOrderRequest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function beginOrderRequest(
  userId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<OrderIdempotencyResult> {
  const inserted = await db
    .insert(orderRequestsTable)
    .values({ userId, idempotencyKey, requestHash, state: "pending" })
    .onConflictDoNothing()
    .returning({ id: orderRequestsTable.id });
  if (inserted.length > 0) return { kind: "started" };

  const [existing] = await db
    .select()
    .from(orderRequestsTable)
    .where(
      and(
        eq(orderRequestsTable.userId, userId),
        eq(orderRequestsTable.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing || existing.requestHash !== requestHash)
    return { kind: "conflict" };
  if (
    existing.state === "completed" &&
    existing.responseStatus &&
    existing.responseBody
  ) {
    return {
      kind: "replay",
      status: existing.responseStatus,
      body: existing.responseBody,
    };
  }
  return { kind: "in_progress" };
}

export async function completeOrderRequest(
  userId: string,
  idempotencyKey: string,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  await db
    .update(orderRequestsTable)
    .set({ state: "completed", responseStatus: status, responseBody: body })
    .where(
      and(
        eq(orderRequestsTable.userId, userId),
        eq(orderRequestsTable.idempotencyKey, idempotencyKey),
        eq(orderRequestsTable.state, "pending"),
      ),
    );
}
