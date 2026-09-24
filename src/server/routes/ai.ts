import express from "express";
import { GoogleGenAI, Type } from "@google/genai";

export function createAiRouter() {
  const router = express.Router();

  let defaultGeminiClient: GoogleGenAI | null = null;
  function getGeminiClient(customKey?: string): GoogleGenAI {
    if (customKey) {
      return new GoogleGenAI({
        apiKey: customKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    if (!defaultGeminiClient) {
      defaultGeminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return defaultGeminiClient;
  }

  // Helper with exponential backoff for API rate limits
  async function generateWithRetry(ai: GoogleGenAI, params: any, retries = 2, delayMs = 1200): Promise<any> {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      const isRateOrOverload = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("overloaded") || errMsg.includes("503");
      if (isRateOrOverload && retries > 0) {
        console.warn(`[AiRouter] Gemini API overloaded or rate limited. Retrying in ${delayMs}ms... (${retries} retries left)`);
        await new Promise((r) => setTimeout(r, delayMs));
        return generateWithRetry(ai, params, retries - 1, delayMs * 2);
      }
      throw err;
    }
  }

  // AI Chat Assistant
  router.post("/chat", async (req, res) => {
    try {
      const { message, history, messages, context, customKey } = req.body;
      const ai = getGeminiClient(customKey);

      let userPrompt = message || "";
      let historyList = history || [];

      if (Array.isArray(messages) && messages.length > 0) {
        const last = messages[messages.length - 1];
        userPrompt = last?.content || last?.text || message || "Hello";
        historyList = messages.slice(0, -1);
      }

      const systemInstruction = `You are the AI Assistant for the Smart Water Billing & Revenue Management Platform.
You assist water authority officials, gram panchayat staff, and administrators with billing queries, tariff structures, customer management, WhatsApp notifications, and payment collection workflows.
Current system context:
- Total Customers: ${context?.customerCount ?? "N/A"}
- Active: ${context?.activeCount ?? "N/A"}
- Defaulters: ${context?.defaulterCount ?? "N/A"}
- Current Tariff: ₹${context?.tariffAmount ?? 200}/cycle
Be professional, accurate, helpful, and concise.`;

      const contents: any[] = [];
      if (Array.isArray(historyList)) {
        for (const msg of historyList.slice(-8)) {
          contents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.text || msg.content || "" }],
          });
        }
      }
      contents.push({
        role: "user",
        parts: [{ text: userPrompt || "Hello" }],
      });

      let response;
      try {
        response = await generateWithRetry(ai, {
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction,
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        });
      } catch (err: any) {
        // Safe fallback when upstream AI API is overloaded
        console.warn("[AiRouter] Upstream model API rate limit hit, using intelligent fallback response:", err.message);
        return res.json({
          reply: `System is currently under high load. For immediate assistance: manage records in Customers, review pending bills in Billing, or view audit trails in Reports.`
        });
      }

      const replyText = response?.text || "I am available to assist you with your water billing queries.";
      return res.json({ reply: replyText });
    } catch (err: any) {
      console.error("[AiRouter] /chat error:", err);
      return res.json({
        reply: "I am ready to help. You can view customer bills, check overdue accounts, or track revenue directly from the navigation menu."
      });
    }
  });

  // AI Meter OCR Scan
  router.post("/meter-scan", async (req, res) => {
    try {
      const rawImage = req.body.imageBase64 || req.body.image;
      if (!rawImage) {
        return res.status(400).json({ error: "Missing imageBase64 payload" });
      }

      const ai = getGeminiClient();
      const cleanBase64 = rawImage.replace(/^data:image\/[a-z]+;base64,/, "");

      const prompt = `Analyze this water meter image and extract:
1. Current meter reading (numeric digits only)
2. Confidence score between 0.0 and 1.0
3. Meter serial number if visible
4. Condition/status (Normal, Damaged, Obstructed, Leaking)
5. Brief observation notes

Return strictly a JSON object with schema:
{
  "reading": number,
  "confidence": number,
  "serialNumber": string,
  "status": string,
  "notes": string
}`;

      let response;
      try {
        response = await generateWithRetry(ai, {
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reading: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER },
                serialNumber: { type: Type.STRING },
                status: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
              required: ["reading", "confidence", "status"],
            },
          },
        });
      } catch (rateErr: any) {
        console.warn("[AiRouter] /meter-scan rate limit hit, providing manual entry fallback:", rateErr.message);
        return res.json({
          reading: 0,
          confidence: 0,
          serialNumber: "",
          status: "Manual Verification",
          notes: "AI scanner rate limit reached. Please record reading manually."
        });
      }

      const text = response?.text;
      const parsed = JSON.parse(text || "{}");
      return res.json(parsed);
    } catch (err: any) {
      console.error("[AiRouter] /meter-scan error:", err);
      return res.json({
        reading: 0,
        confidence: 0,
        serialNumber: "",
        status: "Manual Verification",
        notes: "Scan temporarily unavailable. Please input the reading manually."
      });
    }
  });

  return router;
}
