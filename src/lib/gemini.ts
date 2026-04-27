import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY as string 
});

export const METER_SCANNER_MODEL = "gemini-3-flash-preview";
