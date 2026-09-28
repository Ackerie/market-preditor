import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.GEMINI_BASE_URL,
  },
});
