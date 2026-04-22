# Trismart Automated Billing System

This application is **Client Delivery Ready**. It uses React + Vite + Tailwind CSS for the frontend, and Firebase for the database and authentication.

## 🚀 How to Host on Netlify, Vercel, or Any Static Host

You can seamlessly deploy this to any static host (Netlify, Vercel, GitHub Pages) as a Single Page Application (SPA).

1. Connect your GitHub repository to Netlify (or drag-and-drop the files).
2. Set the build command to: `npm run build`
3. Set the publish directory to: `dist`
4. Deploy!

*(Note: A `netlify.toml` file is already included in this repository to automatically handle SPA routing over Netlify without throwing 404 errors!)*

## ⚠️ Important: Fixing the Firebase "Unauthorized Domain" Error

When you host this newly on Netlify or Vercel, Firebase will block sign-ins from that new domain for security reasons. To fix this:

1. Copy your new live domain name (e.g., `trismart.netlify.app`).
2. Go to your [Firebase Console](https://console.firebase.google.com/).
3. Open **Authentication** from the left sidebar.
4. Click on the **Settings** tab, then select **Authorized domains**.
5. Click **Add domain**, paste your Netlify domain, and hit **Add**.
6. Wait 1-2 minutes for the changes to propagate, and Google Login will work flawlessly.

## 📱 PWA / Client Download (Install App)

This app is configured as a Progressive Web App (PWA).
When you or your users open it in Chrome, Edge, or Safari on Mobile/Desktop, you will see a prompt to **"Install App"**.

Additionally, within the application's sidebar (bottom-left corner), a clear **"Install Desktop App"** / **"Install App"** button is built-in. Users can click this to install it natively to their devices!

## ⚙️ A Note on Webhooks and Backend (Optional Full-Stack)

Most of this application (including the entire CRM, PDF generation, Database, Settings) runs entirely in the browser using Firebase Client APIs. This means it works 100% fine on Netlify!

However, **WhatsApp Chatbot Webhooks** require a backend endpoint listening 24/7.
This repository contains a `server.ts` file implementing exactly that. 

If you wish to use the Automated Backend Webhooks (for Meta WhatsApp inbound messages):
1. Instead of static Netlify, you will need a host that supports Node.js (like Render, Heroku, Railway, or Google Cloud Run).
2. Simply push this repo to Render/Railway, and they will automatically execute `npm run start` (`node dist/server.js`) to spin up the Webhook receiver. 
3. Both your React frontend and your Backend Webhooks will run seamlessly!
