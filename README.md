# Rushab Group — Production Deployment Package

This package contains the fully optimized, minified, and protected production build of the Rushab Group digital agency website, complete with a zero-dependency backend server and real-time Admin Console.

## What is Included:
- `server.js`: Zero-dependency Node.js production server with persistent JSON database for inquiries & visitor telemetry.
- `admin.html`: Passcode-protected dark mode Admin Dashboard to view leads, visitor analytics, update inquiry statuses, and export data.
- `index.html`: Production-ready full-screen 3D interactive showcase with automatic visitor tracking and direct inquiry submission (no `mailto:`).
- `terms.html`: Complete 15-article legal terms page in monochrome aesthetic.
- `style.css`: Ultra-compressed stylesheet with all animations, responsive breakpoints, and custom typography.
- `script.js`: Interactive script with visitor tracking and async backend form submissions.
- `api/`: Pre-configured Vercel serverless functions (`inquiries.js`, `visitors.js`, `auth.js`, `stats.js`).
- `data/`: Auto-created storage folder for client inquiries and visitor logs.
- `assets/`: High-resolution logo and image assets.
- `vercel.json`: Pre-configured edge security headers, clean URLs, `/admin` rewrites, and static asset caching.

---

## Running the Backend & Admin Panel Locally:

1. Ensure you have [Node.js](https://nodejs.org) installed.
2. In your terminal, run:
   ```bash
   npm start
   # or
   node server.js
   ```
3. Open in your browser:
   - **Public Website:** [http://localhost:3000](http://localhost:3000)
   - **Admin Console:** [http://localhost:3000/admin](http://localhost:3000/admin)
4. **Admin Passcode:** Configured securely via the `ADMIN_PASSCODE` variable in your `.env` file (can be changed anytime directly from the Settings tab in the Admin Console).

---

## Admin Console Capabilities:
- **Client Inquiries Manager:** View client name, brand, contact email, selected service, project brief, submission date, and IP address.
- **Status Workflow:** Update lead status (*New Lead*, *Contacted*, *In Progress*, *Completed*, *Archived*).
- **One-Click Reply:** Email client directly with prefilled project inquiry subject lines.
- **Visitor Telemetry:** Real-time log of who visits the website, including IP address, visited page, referrer source, device/browser, and screen resolution.
- **Conversion Metrics:** High-level dashboard displaying conversion rates, top services requested, and device breakdowns.
- **Data Export:** Export client inquiries or visitor logs to CSV and download complete JSON backups.

---

## Publishing to Vercel:

### Method 1: Instant Vercel Deploy (Zero CLI)
1. Push this folder to your GitHub repository.
2. In [Vercel](https://vercel.com), import the repository.
3. The pre-configured `vercel.json` and `/api` serverless functions handle API routing and the `/admin` URL automatically.
4. Click **Deploy**.

---
© 2026 Rushab Group. All Rights Reserved.
