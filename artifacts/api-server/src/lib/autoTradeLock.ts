import { randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { autoTradeCycleLocksTable, db } from "@workspace/db";

const LEASE_MS = 5 * 60 * 1000;
const RENEW_MS = 30 * 1000;

export interface CycleLease {
  isHeld(): boolean;
  release(): Promise<void>;
}

export async function acquireAutoTradeLease(
  lockKey: string,
): Promise<CycleLease | null> {
  const ownerToken = randomUUID();
  const now = new Date();
  const acquired = await db
    .insert(autoTradeCycleLocksTable)
    .values({
      lockKey,
      ownerToken,
      expiresAt: new Date(now.getTime() + LEASE_MS),
    })
    .onConflictDoUpdate({
      target: autoTradeCycleLocksTable.lockKey,
      set: {
        ownerToken,
        expiresAt: new Date(now.getTime() + LEASE_MS),
      },
      where: lt(autoTradeCycleLocksTable.expiresAt, now),
    })
    .returning({ lockKey: autoTradeCycleLocksTable.lockKey });

  if (acquired.length === 0) return null;

  let held = true;
  const renewal = setInterval(async () => {
    try {
      const updated = await db
        .update(autoTradeCycleLocksTable)
        .set({ expiresAt: new Date(Date.now() + LEASE_MS) })
        .where(eq(autoTradeCycleLocksTable.ownerToken, ownerToken))
        .returning({ lockKey: autoTradeCycleLocksTable.lockKey });
      if (updated.length === 0) held = false;
    } catch {
      held = false;
    }
  }, RENEW_MS);
  renewal.unref?.();

  return {
    isHeld: () => held,
    async release() {
      clearInterval(renewal);
      held = false;
      await db
        .delete(autoTradeCycleLocksTable)
        .where(eq(autoTradeCycleLocksTable.ownerToken, ownerToken));
    },
  };
}
