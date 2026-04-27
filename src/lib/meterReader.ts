import { getAiClient, METER_SCANNER_MODEL } from "./gemini";
import { Type } from "@google/genai";

export interface MeterReadingResult {
  reading: number;
  confidence: number;
  meterType: 'water' | 'electric' | 'gas' | 'unknown';
  error?: string;
}

export const analyzeMeterImage = async (base64Image: string): Promise<MeterReadingResult> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: METER_SCANNER_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          },
          {
            text: "Analyze this image of a meter (water/electric/gas). Identify the numerical reading and the type of meter. provide result in JSON."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reading: {
              type: Type.NUMBER,
              description: "The numerical value displayed on the meter dials or digital display."
            },
            meterType: {
              type: Type.STRING,
              enum: ["water", "electric", "gas", "unknown"],
              description: "The category of utility meter identified."
            },
            confidence: {
              type: Type.NUMBER,
              description: "A value between 0 and 1 representing the certainty of the reading."
            }
          },
          required: ["reading", "meterType", "confidence"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result as MeterReadingResult;
  } catch (error) {
    console.error("Meter analysis error:", error);
    return {
      reading: 0,
      confidence: 0,
      meterType: 'unknown',
      error: error instanceof Error ? error.message : "Failed to analyze meter image"
    };
  }
};
