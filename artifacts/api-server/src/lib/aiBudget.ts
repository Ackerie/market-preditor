import { and, eq, gt, lt, sql } from "drizzle-orm";
import {
  aiBudgetReservationsTable,
  aiBudgetSettingsTable,
  aiUsageMonthlyTable,
  db,
} from "@workspace/db";
import {
  AI_PROVIDERS,
  costMicroUsd,
  estimateRequestMicroUsd,
  getProviderPricing,
  type AiProvider,
  type TokenUsage,
} from "./aiPricing";

const RESERVATION_TTL_MS = 30 * 60 * 1000;
const MICRO_USD_PER_DOLLAR = 1_000_000;

export class AiBudgetError extends Error {
  constructor(
    readonly code: "budget_required" | "budget_exceeded",
    message: string,
  ) {
    super(message);
    this.name = "AiBudgetError";
  }
}

export function currentUsageMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function dollarsToMicroUsd(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) {
    throw new Error("AI monthly budget must be a positive dollar amount");
  }
  const amount = Math.round(dollars * MICRO_USD_PER_DOLLAR);
  if (!Number.isSafeInteger(amount)) {
    throw new Error("AI monthly budget is outside the supported range");
  }
  return amount;
}

export function microUsdToDollars(amount: number): number {
  return amount / MICRO_USD_PER_DOLLAR;
}

export function canReserveAiBudget(
  limitMicroUsd: number,
  spentMicroUsd: number,
  pendingMicroUsd: number,
  requestedMicroUsd: number,
): boolean {
  return spentMicroUsd + pendingMicroUsd + requestedMicroUsd <= limitMicroUsd;
}

export function estimateEnsembleMicroUsd(prompt: string): number {
  return AI_PROVIDERS.reduce(
    (total, provider) => total + estimateRequestMicroUsd(provider, prompt),
    0,
  );
}

export function actualEnsembleMicroUsd(
  usage: TokenUsage[],
  prompt: string,
): number {
  const fallbackByProvider = new Map(
    AI_PROVIDERS.map((provider) => [
      provider,
      estimateRequestMicroUsd(provider, prompt),
    ]),
  );
  return usage.reduce((total, item) => {
    const cost = costMicroUsd(item.provider, item);
    return total + (cost ?? fallbackByProvider.get(item.provider)!);
  }, 0);
}

export function estimateAnthropicPredictionMicroUsd(prompt: string): number {
  return estimateRequestMicroUsd("anthropic", prompt, 1200);
}

export function actualAnthropicMicroUsd(
  usage: TokenUsage,
  prompt: string,
): number {
  return (
    costMicroUsd("anthropic", usage) ??
    estimateAnthropicPredictionMicroUsd(prompt)
  );
}

export function assertProvidersConfigured(providers: AiProvider[]): void {
  for (const provider of providers) getProviderPricing(provider);
}

export async function saveAiMonthlyBudget(
  userId: string,
  monthlyBudgetUsd: number,
): Promise<void> {
  await db
    .insert(aiBudgetSettingsTable)
    .values({
      userId,
      monthlyLimitMicroUsd: dollarsToMicroUsd(monthlyBudgetUsd),
    })
    .onConflictDoUpdate({
      target: aiBudgetSettingsTable.userId,
      set: {
        monthlyLimitMicroUsd: dollarsToMicroUsd(monthlyBudgetUsd),
        updatedAt: new Date(),
      },
    });
}

export async function getAiBudgetStatus(userId: string) {
  const usageMonth = currentUsageMonth();
  const [budget] = await db
    .select({ limit: aiBudgetSettingsTable.monthlyLimitMicroUsd })
    .from(aiBudgetSettingsTable)
    .where(eq(aiBudgetSettingsTable.userId, userId))
    .limit(1);
  const [usage] = await db
    .select({ spent: aiUsageMonthlyTable.spentMicroUsd })
    .from(aiUsageMonthlyTable)
    .where(
      and(
        eq(aiUsageMonthlyTable.userId, userId),
        eq(aiUsageMonthlyTable.usageMonth, usageMonth),
      ),
    )
    .limit(1);
  const [reservations] = await db
    .select({
      total: sql<string>`coalesce(sum(${aiBudgetReservationsTable.reservedMicroUsd}), 0)`,
    })
    .from(aiBudgetReservationsTable)
    .where(
      and(
        eq(aiBudgetReservationsTable.userId, userId),
        eq(aiBudgetReservationsTable.usageMonth, usageMonth),
        gt(
          aiBudgetReservationsTable.createdAt,
          new Date(Date.now() - RESERVATION_TTL_MS),
        ),
      ),
    );
  const reservedMicroUsd = Number(reservations?.total ?? 0);
  return {
    monthlyBudgetUsd: budget == null ? null : microUsdToDollars(budget.limit),
    monthlyUsageUsd: microUsdToDollars((usage?.spent ?? 0) + reservedMicroUsd),
    usageMonth,
  };
}

export async function reserveAiBudget(
  userId: string,
  estimatedCostMicroUsd: number,
): Promise<{ id: string; usageMonth: string; estimatedCostMicroUsd: number }> {
  if (
    !Number.isSafeInteger(estimatedCostMicroUsd) ||
    estimatedCostMicroUsd <= 0
  ) {
    throw new Error("Invalid AI cost reservation");
  }

  const usageMonth = currentUsageMonth();
  const staleBefore = new Date(Date.now() - RESERVATION_TTL_MS);
  return db.transaction(async (transaction) => {
    const [budget] = await transaction
      .select({
        limit: aiBudgetSettingsTable.monthlyLimitMicroUsd,
      })
      .from(aiBudgetSettingsTable)
      .where(eq(aiBudgetSettingsTable.userId, userId))
      .limit(1)
      .for("update");
    if (!budget) {
      throw new AiBudgetError(
        "budget_required",
        "Set a monthly AI spending limit in Account → Profile before using shared AI.",
      );
    }

    await transaction
      .insert(aiUsageMonthlyTable)
      .values({ userId, usageMonth, spentMicroUsd: 0 })
      .onConflictDoNothing({
        target: [aiUsageMonthlyTable.userId, aiUsageMonthlyTable.usageMonth],
      });
    const [usage] = await transaction
      .select({ spent: aiUsageMonthlyTable.spentMicroUsd })
      .from(aiUsageMonthlyTable)
      .where(
        and(
          eq(aiUsageMonthlyTable.userId, userId),
          eq(aiUsageMonthlyTable.usageMonth, usageMonth),
        ),
      )
      .limit(1)
      .for("update");

    await transaction
      .delete(aiBudgetReservationsTable)
      .where(
        and(
          eq(aiBudgetReservationsTable.userId, userId),
          eq(aiBudgetReservationsTable.usageMonth, usageMonth),
          lt(aiBudgetReservationsTable.createdAt, staleBefore),
        ),
      );
    const [reservations] = await transaction
      .select({
        total: sql<string>`coalesce(sum(${aiBudgetReservationsTable.reservedMicroUsd}), 0)`,
      })
      .from(aiBudgetReservationsTable)
      .where(
        and(
          eq(aiBudgetReservationsTable.userId, userId),
          eq(aiBudgetReservationsTable.usageMonth, usageMonth),
        ),
      );
    if (
      !canReserveAiBudget(
        budget.limit,
        usage?.spent ?? 0,
        Number(reservations?.total ?? 0),
        estimatedCostMicroUsd,
      )
    ) {
      throw new AiBudgetError(
        "budget_exceeded",
        "Your monthly AI spending limit has been reached.",
      );
    }

    const [reservation] = await transaction
      .insert(aiBudgetReservationsTable)
      .values({ userId, usageMonth, reservedMicroUsd: estimatedCostMicroUsd })
      .returning({ id: aiBudgetReservationsTable.id });
    return { ...reservation, usageMonth, estimatedCostMicroUsd };
  });
}

export async function settleAiBudgetReservation(
  reservation: { id: string; userId: string; usageMonth: string },
  actualCostMicroUsd: number,
): Promise<void> {
  if (!Number.isSafeInteger(actualCostMicroUsd) || actualCostMicroUsd < 0) {
    throw new Error("Invalid AI usage cost");
  }

  await db.transaction(async (transaction) => {
    await transaction
      .delete(aiBudgetReservationsTable)
      .where(
        and(
          eq(aiBudgetReservationsTable.id, reservation.id),
          eq(aiBudgetReservationsTable.userId, reservation.userId),
        ),
      );
    await transaction
      .insert(aiUsageMonthlyTable)
      .values({
        userId: reservation.userId,
        usageMonth: reservation.usageMonth,
        spentMicroUsd: actualCostMicroUsd,
      })
      .onConflictDoUpdate({
        target: [aiUsageMonthlyTable.userId, aiUsageMonthlyTable.usageMonth],
        set: {
          spentMicroUsd: sql`${aiUsageMonthlyTable.spentMicroUsd} + ${actualCostMicroUsd}`,
          updatedAt: new Date(),
        },
      });
  });
}
