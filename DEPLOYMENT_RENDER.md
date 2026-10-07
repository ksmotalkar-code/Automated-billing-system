# Production Deployment Guide: Render & Firebase

This comprehensive guide details the environment variables, service settings, and security credentials required to deploy the **SmartBilling Waterworks Platform** securely on **Render** (as a full-stack Node.js/Vite Web Service) with **Firebase Firestore, Authentication, and Cloud Storage** backend integration.

---

## 1. Render Service Configuration

When setting up your Web Service in the [Render Dashboard](https://dashboard.render.com), use the following configuration settings:

| Setting | Value | Description |
| :--- | :--- | :--- |
| **Runtime** | `Node` | Standard Node.js environment. |
| **Node Version** | `20` or higher | Recommended for running ES module features. |
| **Build Command** | `npm install && npm run build` | Installs both frontend & backend dependencies and builds the Vite distribution. |
| **Start Command** | `npm start` | Launches the Express server via `tsx` (TypeScript Executor). |
| **Instance Type** | `Web Service` | Required to expose public ports (`PORT` is automatically managed by Render). |

---

## 2. Environment Variables & Secret Credentials

Configure these keys in your **Render Web Service → Environment** tab.

### 🌐 System & Web App Variables
* **`NODE_ENV`** (`production`):
  * **Required**: Enables Express compression, serves pre-built production assets from `dist/`, and disables hot-module replacement (HMR) debugging endpoints.
* **`PORT`** (`3000`):
  * *Automatically injected by Render*, but can be set manually if running behind custom ingress.
* **`APP_URL`** (e.g. `https://panchayat-waterworks.onrender.com`):
  * **Required**: The public web URL of your Render service. Used to generate secure resident portal payment links, generate dynamic invoice QR codes, and register WhatsApp API webhooks.

### 🤖 Gemini AI API Variables
* **`GEMINI_API_KEY`** (e.g. `AIzaSy...`):
  * **Required**: Powers the server-side Gemini AI Client (`gemini-2.5-flash`). Used for the Interactive Citizen Chatbot, automated meter scanner (OCR reading recognition), and self-healing diagnostic helpers.

### 🔥 Firebase Database & Service Accounts
Render can run using client-side Firebase SDK credentials, but for robust production operations (including background bulk calculations and secure image storage), a Firebase Admin Service Account is recommended.

#### Option A: Service Account (Recommended for Admin Operations)
* **`FIREBASE_SERVICE_ACCOUNT`**:
  * **Value**: Paste the entire JSON object from your Google Cloud Service Account key file.
  * **How to generate**:
    1. Go to your [Firebase Console](https://console.firebase.google.com).
    2. Click the ⚙️ Gear icon → **Project Settings** → **Service Accounts**.
    3. Click **Generate New Private Key**, copy the complete JSON text, and paste it into Render.
  * **Security**: Render encrypts all environment variables at rest.

#### Option B: Firebase Client Configuration (Fallback)
If a Service Account is not used, the server falls back to client credentials bundled in `firebase-applet-config.json` or supplied via:
* **`FIREBASE_CONFIG`**:
  * **Value**: A serialized JSON string of your Firebase Web App configuration:
    ```json
    {
      "projectId": "your-project-id",
      "appId": "your-app-id",
      "apiKey": "your-api-key",
      "authDomain": "your-auth-domain",
      "firestoreDatabaseId": "your-database-id",
      "storageBucket": "your-storage-bucket",
      "messagingSenderId": "your-sender-id"
    }
    ```

---

### 💬 WhatsApp Business Cloud API & Webhooks
These variables establish the live link with Meta's developer APIs to send bills and receive real-time webhooks.

* **`VITE_WHATSAPP_API_KEY`**:
  * **Value**: Your permanent Meta System User Access Token (or Dealer Token).
* **`VITE_WHATSAPP_PHONE_NUMBER_ID`**:
  * **Value**: The 15-digit Meta Phone ID associated with your registered WhatsApp Business profile.
* **`META_VERIFY_TOKEN`** (e.g. `waterbilling123`):
  * **Value**: A custom text string used to verify your callback endpoint in the Meta App Developer Dashboard under **Webhooks**.

---

### 💳 Payment Gateways & Signature Security
Secures incoming callbacks from third-party payment gateways (such as WhatsApp Pay, Razorpay, or Cashfree) when a resident pays an invoice.

* **`PAYMENT_GATEWAY_SECRET`**:
  * **Value**: Secret merchant key used to sign out-of-band payment requests.
* **`PAYMENT_GATEWAY_WEBHOOK_SECRET`**:
  * **Value**: Shared verification key. If set, Express Webhook routes (`/api/payment-webhook/:ownerId`) will actively verify the authenticity of the signature headers (`x-whatsapp-signature` or `x-webhook-signature`) to prevent payment spoofing.

---

## 3. Securely Storing Secrets in Render

To prevent leakage, follow these Render security best practices:

1. **Never Commit Secrets**: Ensure `.env` is listed in your `.gitignore` file.
2. **Use Render's "Secret Files"**:
   * Instead of pasting large configuration structures (like `firebase-applet-config.json`) into single environment variables, go to **Environment** → **Secret Files** on Render.
   * Add a file named `firebase-applet-config.json` and paste your project configurations there. Render mounts this file securely inside your application's build root at runtime.
3. **Use Variable Groups**:
   * If you run multiple staging/production environments on Render, create a **Secret Group** under your Render Account. This allows you to apply consistent Firebase and Gemini credentials to multiple services instantly.

---

## 4. Post-Deployment Checklist (Important)

### 🔑 Enable Firebase Authorized Domains
Since Render hosts your app on a custom domain, Google/Email authentication popups will be blocked by default until authorized in your Firebase Project:
1. Open the [Firebase Console](https://console.firebase.google.com).
2. Go to **Authentication** → **Settings** → **Authorized Domains**.
3. Click **Add Domain** and input your public Render web app domain (e.g. `panchayat-waterworks.onrender.com`).

### 🔗 Configure Webhooks in Meta Developer Console
To receive live replies and citizen complaints directly into your Panchayat dashboard:
1. Go to the [Meta Developer Dashboard](https://developers.facebook.com).
2. Set your **Webhook Callback URL** to:
   ```text
   https://your-app-name.onrender.com/api/whatsapp-webhook
   ```
3. Set your **Verify Token** to match the value you stored in your Render environment variable (`META_VERIFY_TOKEN`).
