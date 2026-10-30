import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  aiBudgetReservationsTable: {},
  aiBudgetSettingsTable: {},
  aiUsageMonthlyTable: {},
  db: {},
}));

import {
  actualEnsembleMicroUsd,
  canReserveAiBudget,
  currentUsageMonth,
  dollarsToMicroUsd,
  estimateEnsembleMicroUsd,
  microUsdToDollars,
} from "./aiBudget";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("monthly shared AI budget accounting", () => {
  it("uses a UTC calendar month for budget resets", () => {
    expect(currentUsageMonth(new Date("2026-06-01T00:30:00+02:00"))).toBe(
      "2026-05",
    );
  });

  it("converts customer limits to exact microdollars", () => {
    expect(dollarsToMicroUsd(100)).toBe(100_000_000);
    expect(microUsdToDollars(100_000_000)).toBe(100);
    expect(() => dollarsToMicroUsd(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("allows a reservation at the cap and rejects one microdollar over", () => {
    expect(canReserveAiBudget(100, 50, 25, 25)).toBe(true);
    expect(canReserveAiBudget(100, 50, 25, 26)).toBe(false);
  });

  it("reserves all three models and settles reported provider tokens", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "shared-anthropic-key");
    vi.stubEnv("OPENAI_API_KEY", "shared-openai-key");
    vi.stubEnv("GEMINI_API_KEY", "shared-gemini-key");
    vi.stubEnv("AI_ANTHROPIC_INPUT_USD_PER_MILLION", "3");
    vi.stubEnv("AI_ANTHROPIC_OUTPUT_USD_PER_MILLION", "15");
    vi.stubEnv("AI_OPENAI_INPUT_USD_PER_MILLION", "1");
    vi.stubEnv("AI_OPENAI_OUTPUT_USD_PER_MILLION", "2");
    vi.stubEnv("AI_GEMINI_INPUT_USD_PER_MILLION", "0.5");
    vi.stubEnv("AI_GEMINI_OUTPUT_USD_PER_MILLION", "3");
    const prompt = "test prompt";

    expect(estimateEnsembleMicroUsd(prompt)).toBeGreaterThan(0);
    expect(
      actualEnsembleMicroUsd(
        [
          { provider: "anthropic", inputTokens: 1000, outputTokens: 100 },
          { provider: "openai", inputTokens: 1000, outputTokens: 100 },
          { provider: "gemini", inputTokens: 1000, outputTokens: 100 },
        ],
        prompt,
      ),
    ).toBe(4500 + 1200 + 800);
  });
});
