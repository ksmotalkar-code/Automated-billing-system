import { auth } from '../firebase';
import { authFetch } from '../lib/api';

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
  templateCategory?: 'billing' | 'receipt' | 'broadcast' | 'welcome' | 'overdue' | 'suspension' | 'custom';
  templateParams?: any[];
  customTemplateName?: string;
  ownerId?: string;
}

class WhatsAppService {
  private apiKey: string | null = null;
  private phoneNumberId: string | null = null;
  private watiAccessToken: string | null = null;
  private baseUrl: string = 'https://graph.facebook.com/v21.0'; // Meta WhatsApp Business API
  private watiApiEndpoint: string | null = null;
  private preferredMethod: string | null = null;

  constructor() {
    // These will be populated from environment variables or settings later
    this.apiKey = import.meta.env.VITE_WHATSAPP_API_KEY || null;
    this.phoneNumberId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || null;
  }

  public updateConfig(apiKey: string | null, phoneNumberId: string | null, watiAccessToken?: string | null, watiApiEndpoint?: string | null, preferredMethod?: string | null) {
    this.apiKey = apiKey ? apiKey.trim() : null;
    if (watiAccessToken !== undefined) {
       this.watiAccessToken = watiAccessToken ? watiAccessToken.trim() : null;
    }
    if (watiApiEndpoint !== undefined) {
       this.watiApiEndpoint = watiApiEndpoint ? watiApiEndpoint.trim() : null;
    }
    if (preferredMethod !== undefined) {
       this.preferredMethod = preferredMethod;
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
    const hasWati = !!(this.watiAccessToken && this.watiAccessToken.trim());
    return (hasMeta || hasWati) && this.preferredMethod !== 'manual_link';
  }

  /**
   * Sends an automated message (and optional attachment)
   * This is the core automation function.
   */
  public async sendMessage(params: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string; fellBackToManual?: boolean }> {
    // We now use our backend proxy to send messages safely (avoiding CORS and keeping keys server-side)
    try {
      const ownerId = params.ownerId || auth.currentUser?.uid || 'system';

      let mediaBase64: string | undefined = undefined;
      let mediaName: string | undefined = undefined;

      if (params.attachment) {
         mediaName = params.attachmentName || (params.attachment instanceof File ? params.attachment.name : 'attachment');
         try {
           const rawBase64 = await new Promise<string>((resolve, reject) => {
             const reader = new FileReader();
             reader.onloadend = () => resolve(reader.result as string);
             reader.onerror = reject;
             reader.readAsDataURL(params.attachment!);
           });
           // Limit base64 payload size to 4MB to prevent browser fetch stream allocation drops
           if (rawBase64 && rawBase64.length < 4 * 1024 * 1024) {
             mediaBase64 = rawBase64;
           } else {
             console.warn('Attachment exceeds 4MB limit; sending template message without embedded base64 payload.');
           }
         } catch (attachErr) {
           console.warn('Could not read attachment file for WhatsApp message:', attachErr);
         }
      }

      const response = await authFetch('/api/wa/send', {
        method: 'POST',
        body: JSON.stringify({
          ownerId,
          to: params.to,
          message: params.message,
          mediaBase64,
          mediaName,
          templateCategory: params.templateCategory,
          templateParams: params.templateParams,
          customTemplateName: params.customTemplateName,
          apiKey: this.apiKey,
          phoneId: this.phoneNumberId,
          watiAccessToken: this.watiAccessToken,
          watiApiEndpoint: this.watiApiEndpoint,
          method: this.preferredMethod
        }),
      });

      let data: any = {};
      let parseError = false;
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          parseError = true;
          data = { error: `Server returned invalid JSON response (HTTP ${response.status})` };
        }
      } else {
        parseError = true;
        let textSummary = '';
        try {
          const text = await response.text();
          if (text && !text.includes('<!doctype') && !text.includes('<html')) {
            textSummary = text.slice(0, 150);
          }
        } catch (e) {}
        data = { error: textSummary ? `Server error (HTTP ${response.status}): ${textSummary}` : `Server returned non-JSON response (HTTP ${response.status}: ${response.statusText || 'Error'})` };
      }

      if (!response.ok || parseError) {
        return { 
          success: false, 
          error: data.error || data.message || `Server HTTP ${response.status}`,
          fellBackToManual: true
        };
      }

      const messageId = data.messageId || data.messages?.[0]?.id || data.id;
      if (!messageId && !data.success) {
         return {
           success: false,
           error: data.error || "Server reported failure without specific error message.",
           fellBackToManual: true
         };
      }

      return { success: true, messageId };
    } catch (error: any) {
      console.warn('WhatsApp Service Warning (Network or API issue):', error);
      const errDetail = error?.message || String(error);
      return { 
        success: false, 
        error: errDetail.includes('fetch') || errDetail.includes('Network')
          ? 'Network connection issue while contacting app server (/api/wa/send). Please ensure the server is online.' 
          : errDetail,
        fellBackToManual: true
      };
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

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error(`Failed to upload media to WhatsApp API (HTTP ${response.status})`);
    }

    const data = await response.json();
    return data.id;
  }
}

export const whatsappService = new WhatsAppService();
