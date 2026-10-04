import { GoogleGenAI } from "@google/genai";

export function createGeminiClient(apiKey: string, baseUrl?: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "", baseUrl },
  });
}

export const ai = createGeminiClient(
  process.env.GEMINI_API_KEY ?? "",
  process.env.GEMINI_BASE_URL,
);
