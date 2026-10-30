export const AI_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface TokenUsage {
  provider: AiProvider;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface ProviderPricing {
  apiKey: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  maxOutputTokens: number;
}

const PROVIDER_CONFIG: Record<
  AiProvider,
  { apiKey: string; inputRate: string; outputRate: string; maxOutput: number }
> = {
  anthropic: {
    apiKey: "ANTHROPIC_API_KEY",
    inputRate: "AI_ANTHROPIC_INPUT_USD_PER_MILLION",
    outputRate: "AI_ANTHROPIC_OUTPUT_USD_PER_MILLION",
    maxOutput: 280,
  },
  openai: {
    apiKey: "OPENAI_API_KEY",
    inputRate: "AI_OPENAI_INPUT_USD_PER_MILLION",
    outputRate: "AI_OPENAI_OUTPUT_USD_PER_MILLION",
    maxOutput: 8192,
  },
  gemini: {
    apiKey: "GEMINI_API_KEY",
    inputRate: "AI_GEMINI_INPUT_USD_PER_MILLION",
    outputRate: "AI_GEMINI_OUTPUT_USD_PER_MILLION",
    maxOutput: 8192,
  },
};

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

function configuredPrice(name: string): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new AiConfigurationError(
      `Shared AI pricing is not configured (${name})`,
    );
  }
  return value;
}

export function getProviderPricing(provider: AiProvider): ProviderPricing {
  const config = PROVIDER_CONFIG[provider];
  const apiKey = process.env[config.apiKey]?.trim();
  if (!apiKey) {
    throw new AiConfigurationError(
      `Shared AI provider is not configured (${config.apiKey})`,
    );
  }
  return {
    apiKey,
    inputUsdPerMillion: configuredPrice(config.inputRate),
    outputUsdPerMillion: configuredPrice(config.outputRate),
    maxOutputTokens: config.maxOutput,
  };
}

export function getSharedAiReadiness(): Record<AiProvider, boolean> {
  const isReady = (provider: AiProvider) => {
    try {
      getProviderPricing(provider);
      return true;
    } catch {
      return false;
    }
  };
  return {
    anthropic: isReady("anthropic"),
    openai: isReady("openai"),
    gemini: isReady("gemini"),
  };
}

export function costMicroUsd(
  provider: AiProvider,
  usage: Pick<TokenUsage, "inputTokens" | "outputTokens">,
): number | null {
  if (
    usage.inputTokens == null ||
    usage.outputTokens == null ||
    !Number.isSafeInteger(usage.inputTokens) ||
    !Number.isSafeInteger(usage.outputTokens) ||
    usage.inputTokens < 0 ||
    usage.outputTokens < 0
  ) {
    return null;
  }
  const pricing = getProviderPricing(provider);
  return Math.ceil(
    usage.inputTokens * pricing.inputUsdPerMillion +
      usage.outputTokens * pricing.outputUsdPerMillion,
  );
}

export function estimateRequestMicroUsd(
  provider: AiProvider,
  prompt: string,
  maxOutputTokens?: number,
): number {
  const pricing = getProviderPricing(provider);
  const estimatedInputTokens = Math.ceil((prompt.length + 1000) / 2);
  return Math.ceil(
    estimatedInputTokens * pricing.inputUsdPerMillion +
      (maxOutputTokens ?? pricing.maxOutputTokens) *
        pricing.outputUsdPerMillion,
  );
}
