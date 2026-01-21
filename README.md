<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1_C3snw5r0RrZt-EwqmApJHMpAwmLDhH7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure environment variables:
   - Copy `.env.example` to `.env.local` and fill:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_ENABLE_SIGNUP` (default `true`)
   - `GEMINI_API_KEY` is currently not used by the app
3. Run the app:
   `npm run dev`

## Auth & Access Control

- The app is protected by a login gate: unauthenticated users cannot access any content.
- Signup can be temporarily enabled by setting `VITE_ENABLE_SIGNUP=true` (UI only).
- After you have created the initial accounts, disable new signups in Supabase Auth settings (recommended). This is the effective protection.

## Supabase Backend

- Setup guide: [supabase/README.md](supabase/README.md)
