import { and, eq, sql } from "drizzle-orm";
import { aiUsageDailyTable, db } from "@workspace/db";

export type AiProvider = "anthropic" | "openai" | "gemini";

const DEFAULT_DAILY_LIMIT = 500;

function dailyLimit(): number {
  const configured = Number(process.env.AI_DAILY_REQUEST_LIMIT);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_LIMIT;
}

export async function consumeAiRequest(
  userId: string,
  provider: AiProvider,
): Promise<boolean> {
  const usageDate = new Date().toISOString().slice(0, 10);
  const limit = dailyLimit();
  const inserted = await db
    .insert(aiUsageDailyTable)
    .values({ userId, provider, usageDate, requestCount: 1 })
    .onConflictDoUpdate({
      target: [
        aiUsageDailyTable.userId,
        aiUsageDailyTable.provider,
        aiUsageDailyTable.usageDate,
      ],
      set: {
        requestCount: sql`${aiUsageDailyTable.requestCount} + 1`,
      },
      where: sql`${aiUsageDailyTable.requestCount} < ${limit}`,
    })
    .returning({ id: aiUsageDailyTable.id });
  return inserted.length > 0;
}

export async function getAiUsage(
  userId: string,
  provider: AiProvider,
): Promise<number> {
  const usageDate = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select({ requestCount: aiUsageDailyTable.requestCount })
    .from(aiUsageDailyTable)
    .where(
      and(
        eq(aiUsageDailyTable.userId, userId),
        eq(aiUsageDailyTable.provider, provider),
        eq(aiUsageDailyTable.usageDate, usageDate),
      ),
    );
  return row?.requestCount ?? 0;
}
