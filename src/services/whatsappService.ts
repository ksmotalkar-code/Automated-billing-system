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
  private baseUrl: string = 'https://graph.facebook.com/v17.0'; // Example for Meta WhatsApp Business API

  constructor() {
    // These will be populated from environment variables or settings later
    this.apiKey = import.meta.env.VITE_WHATSAPP_API_KEY || null;
    this.phoneNumberId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || null;
  }

  public updateConfig(apiKey: string | null, phoneNumberId: string | null) {
    if (apiKey) this.apiKey = apiKey;
    if (phoneNumberId) this.phoneNumberId = phoneNumberId;
  }

  /**
   * Checks if the API is configured and ready to use
   */
  public isConfigured(): boolean {
    return !!(this.apiKey && this.phoneNumberId);
  }

  /**
   * Sends an automated message (and optional attachment)
   * This is the core automation function.
   */
  public async sendMessage(params: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isConfigured()) {
      console.warn('WhatsApp API is not configured. Falling back to manual mode or ignoring.');
      return { success: false, error: 'API_NOT_CONFIGURED' };
    }

    try {
      // 1. If there's an attachment, we would typically upload it first to the provider's media endpoint
      let mediaId = null;
      if (params.attachment) {
        mediaId = await this.uploadMedia(params.attachment, params.attachmentType || 'application/pdf');
      }

      // 2. Send the message (Text or Template or Media Message)
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: params.to.startsWith('91') ? params.to : `91${params.to}`, // Default to India prefix if missing
          type: mediaId ? 'document' : 'text',
          text: mediaId ? undefined : { body: params.message },
          document: mediaId ? {
            id: mediaId,
            caption: params.message,
            filename: params.attachmentName || 'document.pdf'
          } : undefined
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to send message');
      }

      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error: any) {
      console.error('WhatsApp API Error:', error);
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
