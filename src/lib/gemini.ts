import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

export const getAiClient = (): GoogleGenAI => {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey: key || 'missing_key' });
  }
  return aiClient;
};

export const METER_SCANNER_MODEL = "gemini-3-flash-preview";
