/**
 * WhatsApp API Service
 * This service handles automated message sending via a WhatsApp Business API provider.
 * Currently implemented as a placeholder for future activation.
 */

export interface WhatsAppMessage {
  to: string;
  message: string;
  attachment?: Blob | File;
  attachmentName?: string;
  attachmentType?: string;
}

class WhatsAppService {
  private apiKey: string | null = null;
  private phoneNumberId: string | null = null;
  private cunnektApiKey: string | null = null;
  private baseUrl: string = 'https://graph.facebook.com/v17.0'; // Example for Meta WhatsApp Business API

  constructor() {
    // These will be populated from environment variables or settings later
    this.apiKey = import.meta.env.VITE_WHATSAPP_API_KEY || null;
    this.phoneNumberId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || null;
  }

  public updateConfig(apiKey: string | null, phoneNumberId: string | null, cunnektApiKey?: string | null) {
    this.apiKey = apiKey ? apiKey.trim() : null;
    if (cunnektApiKey !== undefined) {
       this.cunnektApiKey = cunnektApiKey ? cunnektApiKey.trim() : null;
    }
    if (phoneNumberId) {
      let cleaned = phoneNumberId.trim();
      // If user accidentally pasted the URL, extract the ID
      const match = cleaned.match(/v\d+\.\d+\/(\d+)\/messages/);
      if (match) {
        cleaned = match[1];
      }
      this.phoneNumberId = cleaned;
    } else {
      this.phoneNumberId = null;
    }
  }

  /**
   * Checks if the API is configured and ready to use
   */
  public isConfigured(): boolean {
    const hasMeta = !!(this.apiKey && this.apiKey.trim() && this.phoneNumberId && this.phoneNumberId.trim() && /^\d+$/.test(this.phoneNumberId.trim()));
    const hasCunnekt = !!(this.cunnektApiKey && this.cunnektApiKey.trim());
    return hasMeta || hasCunnekt;
  }

  /**
   * Sends an automated message (and optional attachment)
   * This is the core automation function.
   */
  public async sendMessage(params: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // We now use our backend proxy to send messages safely (avoiding CORS and keeping keys server-side)
    try {
      const { auth } = await import('../firebase');
      const ownerId = auth.currentUser?.uid;
      
      if (!ownerId) {
        return { success: false, error: 'USER_NOT_AUTHENTICATED' };
      }

      let mediaBase64: string | undefined = undefined;
      let mediaName: string | undefined = undefined;

      if (params.attachment) {
         mediaName = params.attachmentName || (params.attachment instanceof File ? params.attachment.name : 'attachment');
         mediaBase64 = await new Promise((resolve, reject) => {
           const reader = new FileReader();
           reader.onloadend = () => resolve(reader.result as string);
           reader.onerror = reject;
           reader.readAsDataURL(params.attachment!);
         });
      }

      const response = await fetch('/api/wa/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerId,
          to: params.to,
          message: params.message,
          mediaBase64,
          mediaName
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to send message' };
      }

      return { success: true, messageId: data.messageId };
    } catch (error: any) {
      console.error('WhatsApp Service Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Uploads media to WhatsApp servers
   */
  private async uploadMedia(file: Blob | File, type: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('messaging_product', 'whatsapp');

    const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to upload media');
    }

    return data.id;
  }
}

export const whatsappService = new WhatsAppService();
