export interface MeterReadingResult {
  reading: number;
  confidence: number;
  meterType: 'water' | 'electric' | 'gas' | 'unknown';
  error?: string;
}

export const analyzeMeterImage = async (base64Image: string): Promise<MeterReadingResult> => {
  try {
    const response = await fetch("/api/ai/meter-scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: base64Image }),
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`Server returned non-JSON response (${response.status})`);
    }

    const result = await response.json();
    return result as MeterReadingResult;
  } catch (error) {
    console.error("Meter analysis error:", error);
    return {
      reading: 0,
      confidence: 0,
      meterType: 'unknown',
      error: error instanceof Error ? error.message : "Failed to analyze meter image",
    };
  }
};
