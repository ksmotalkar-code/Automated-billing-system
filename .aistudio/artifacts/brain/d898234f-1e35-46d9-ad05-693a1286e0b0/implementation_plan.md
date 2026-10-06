# Multilingual WhatsApp Voice Note AI Assistant

This document outlines the architectural plan to integrate a Multilingual WhatsApp Voice Note AI Assistant for the Panchayat Water Billing & Management platform. This system enables rural citizens to send voice notes in Punjabi, Hindi, or English, transcribes and translates them using server-side Gemini intelligence, matches their intent against real water database schemas (billing, receipts, complaints, reports), and replies in their native language with exact records.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> To support elder and rural residents who prefer speech over typing, we are implementing a complete server-side voice processing pipeline. Below are the confirmed architectural decisions:

*   **Transcription Model**: We will utilize the multimodal `gemini-3.8-flash` model, which excels at high-throughput, multilingual, low-latency audio transcription and native Punjabi/Hindi speech-to-text.
*   **Administrative Verification Sandbox**: We will build an interactive Voice Simulation & Diagnostic panel inside the Panchayat Admin Dashboard. This allows staff to record or upload test audio files directly from their browser, view live transcription outputs, inspect extracted intents, and test chatbot responses.
*   **System Integration**: The speech-to-text pipeline is fully integrated with the existing WhatsApp webhook (`/api/whatsapp-webhook`) and portal simulation routes to natively handle media messages of type `audio` and `voice`.

---

## 1. Overview & Core Concept

### What It Does
Citizens can record a voice note on WhatsApp (e.g., *"Satsriakal, mera is mahine da paani da bill kinna hai?"* or *"मेरा नलका लीक हो रहा है, शिकायत दर्ज़ करें"*). The backend captures the audio file, transcribes it, extracts the target customer's identity, determines the specific utility intent, queries the live Firestore database, and returns a tailored native Punjabi/Hindi text answer (optionally attaching bills, QR codes, or report documents).

### Target Audience
*   **Rural Citizens & Elders**: Who find typing in local scripts (Gurmukhi/Devanagari) on mobile keyboards challenging but are comfortable sending WhatsApp voice notes.
*   **Panchayat Staff**: Who need to verify incoming resident audio messages and monitor system performance from a centralized dashboard.

---

## 2. Technical Architecture & Data Flow

Below is the technical sequence illustrating how a citizen's voice note is intercepted, processed, and answered:

```
 Citizen (Voice Note)
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ WhatsApp official API or Admin Simulator Sandbox       │
└───────────────────┬────────────────────────────────────┘
                    │ [Base64 Audio / Binary Stream]
                    ▼
┌────────────────────────────────────────────────────────┐
│ Express Server: POST /api/chatbot/voice-process        │
└───────────────────┬────────────────────────────────────┘
                    │
                    ├────────────────────────────────────┐
                    ▼ (Audio Transcription & Translation) │
┌────────────────────────────────────────────────────────┐│
│ Google Gemini Client ('gemini-3.8-flash')              ││
└───────────────────┬────────────────────────────────────┘│
                    │ [Text Transcript]                  │
                    ▼                                    │
┌────────────────────────────────────────────────────────┐│ [Live Audit logs]
│ Rule-Based & Semantic Intent Engine                    ││
│ (Billing, Receipts, Timings, Complaints, Reports)       ││
└───────────────────┬────────────────────────────────────┘│
                    │ [Matched Query & Variables]        │
                    ▼                                    │
┌────────────────────────────────────────────────────────┐│
│ Firestore Database (Customers, Transactions, Settings)  ││
└───────────────────┬────────────────────────────────────┘│
                    │ [Real Data Results]                │
                    ▼                                    │
┌────────────────────────────────────────────────────────┐│
│ Localized Reply Generation (Hindi / Punjabi / English) ││
└───────────────────┬────────────────────────────────────┘│
                    │                                     │
                    ▼                                     ▼
┌────────────────────────────────────────────────────────┐
│ Response Sent back via WhatsApp + Admin Chat Logs      │
└────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Steps

### Phase 1: Server-Side Speech Processing Route
*   Extend `server.ts` with a `/api/chatbot/voice-process` endpoint.
*   Configure the server-side `@google/genai` client using `gemini-3.8-flash`.
*   Implement clean mime-type parsing for incoming voice note attachments (ogg, mp3, wav, m4a).
*   Add semantic translations so Punjabi/Hindi speech queries map directly to standardized intents:
    *   *Billing/Balance* (`"Download My Bill"`, `"Pay Bill"`, `"Check Balance"`)
    *   *Complaints* (`"Register Complaint"`)
    *   *Panchayat Reports* (`"Monthly Report"`, `"Reports"`)
    *   *Helplines/Timings* (`"Supply Timings"`, `"Water Quality"`)

### Phase 2: Panchayat Admin Voice Sandbox UI
*   Add an interactive **Voice Simulation tab** inside `ChatbotView.tsx` with a microphone capture component.
*   Provide quick-click voice templates (Pre-recorded Punjabi/Hindi billing and complaint audio cues) for direct testing.
*   Render live visual feedback showing:
    1.  *Audio Waveform & Playback Controls*
    2.  *Gemini Live Transcription*
    3.  *Detected System Intent & Target Customer Entity*
    4.  *Live DB Query Variables (Balance, Due Dates, Active Alerts)*
    5.  *Chatbot Response Preview in Native Language*

### Phase 3: Webhook & Logging Integration
*   Wire the Meta WhatsApp incoming webhook in `server.ts` to intercept message objects where `type: "audio"` or `type: "voice"`.
*   Save the processed audio transcriptions in the resident's `chat_history` collection and `whatsapp_logs` to maintain an audit trail for the administration.

---

## 4. Verification Plan

### Automated Build Checks
*   Run `npm run build` and `tsc --noEmit` (`lint_applet`) to ensure type constraints are satisfied.

### Functional Verification Scenarios
1.  **Voice Billing Inquiry (Punjabi)**:
    *   *Input*: Speak/upload: *"Mera bill daso kinna hai"*
    *   *Expected Result*: Transcript matches billing intent. Reply returns exact customer outstanding balance in Punjabi with bill download link.
2.  **Voice Complaint (Hindi)**:
    *   *Input*: Speak/upload: *"पानी का प्रेशर बहुत कम है शिकायत दर्ज करें"*
    *   *Expected Result*: Transcript registers a pending complaint in Firestore and responds with the new complaint tracking ID.
3.  **Fallback Scenario**:
    *   *Input*: Unintelligible noise or out-of-domain query.
    *   *Expected Result*: Helpful local language menu guidance is presented.
