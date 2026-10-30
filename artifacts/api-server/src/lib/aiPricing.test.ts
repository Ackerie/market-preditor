import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiConfigurationError,
  costMicroUsd,
  estimateRequestMicroUsd,
  getSharedAiReadiness,
} from "./aiPricing";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared AI pricing", () => {
  it("calculates provider cost in microdollars from reported token usage", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "shared-anthropic-key");
    vi.stubEnv("AI_ANTHROPIC_INPUT_USD_PER_MILLION", "3");
    vi.stubEnv("AI_ANTHROPIC_OUTPUT_USD_PER_MILLION", "15");

    expect(
      costMicroUsd("anthropic", { inputTokens: 1000, outputTokens: 100 }),
    ).toBe(4500);
  });

  it("reserves estimated input and maximum output cost before a request", () => {
    vi.stubEnv("OPENAI_API_KEY", "shared-openai-key");
    vi.stubEnv("AI_OPENAI_INPUT_USD_PER_MILLION", "1");
    vi.stubEnv("AI_OPENAI_OUTPUT_USD_PER_MILLION", "2");

    expect(estimateRequestMicroUsd("openai", "test prompt")).toBe(
      Math.ceil((1011 / 2) * 1 + 8192 * 2),
    );
  });

  it("fails closed when a provider key or rate is missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_ANTHROPIC_INPUT_USD_PER_MILLION", "3");
    vi.stubEnv("AI_ANTHROPIC_OUTPUT_USD_PER_MILLION", "15");

    expect(() =>
      costMicroUsd("anthropic", { inputTokens: 100, outputTokens: 10 }),
    ).toThrow(AiConfigurationError);
    expect(getSharedAiReadiness().anthropic).toBe(false);
  });
});
