# SmartBilling CRM & Automation System

An enterprise-grade, automated CRM andBilling management system designed for managing customer accounts, automated subscription billing, and WhatsApp-integrated communication.

## Key Features
- **Automated Billing Engine:** Runs daily cron cycles to generate invoices and apply charges/penalties based on custom billing cycles.
- **WhatsApp Automation:** Integrated with Meta WhatsApp Business API for real-time customer notifications (payment receipts, status updates, invoice delivery).
- **Payment Reconciliation:** Includes a dynamic Payment Gateway Webhook (`/api/payment-webhook/:ownerId`) for autonomous balance clearing.
- **Enterprise CRM:** Manages customer profiles, complaints, and bulk communication.
- **Bulk Data Handling:** Import/Export capabilities for customer data and automated 6-month data retention policy.

## Project Structure
- `src/lib/db.ts`: Central database logic (Database-agnostic Firestore interface).
- `src/lib/automation.ts`: Core billing and notification automation engine.
- `src/views/`: Individual frontend dashboard views (Dashboard, Customers, Reports, Settings, etc.).
- `server.ts`: Express backend handling webhooks, automation triggers, and API routes.

## Development & Deployment
- Built with React, Vite, Tailwind CSS, Firestore.
- Complete Full-Stack standard Node.js Express server to handle webhooks and fallback integrations.

### How to Deploy on Render
1. Push this repository to GitHub.
2. Sign in to Render (https://render.com) and create a new **Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically detect the `render.yaml` configuration and deploy a Docker web service on the **Free** tier.
5. In your Render Dashboard, navigate to the newly created Web Service, go to **Environment**, and add any necessary Environment Variables (e.g., `FIREBASE_SERVICE_ACCOUNT` for admin SDK privileges in webhooks).
