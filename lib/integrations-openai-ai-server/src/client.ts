import OpenAI from "openai";

export function createOpenAiClient(apiKey: string, baseURL?: string) {
  return new OpenAI({ apiKey, baseURL });
}

export const openai = createOpenAiClient(
  process.env.OPENAI_API_KEY ?? "",
  process.env.OPENAI_BASE_URL,
);
