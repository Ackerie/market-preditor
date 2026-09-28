import { GoogleGenAI, Modality } from "@google/genai";

if (!process.env.GEMINI_BASE_URL) {
  throw new Error(
    "GEMINI_BASE_URL must be set when using a custom Gemini endpoint.",
  );
}

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY must be set.");
}

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.GEMINI_BASE_URL,
  },
});

export async function generateImage(
  prompt: string,
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) =>
      part.inlineData,
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
