import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(apiKey: string, baseURL?: string) {
  return new Anthropic({ apiKey, baseURL });
}

export const anthropic = createAnthropicClient(
  process.env.ANTHROPIC_API_KEY ?? "",
  process.env.ANTHROPIC_BASE_URL,
);
