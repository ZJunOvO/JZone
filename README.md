# JZone Player

A modern, feature-rich web-based music player built with React, TypeScript, and Supabase.

## Features

- **Music Playback**: Multiple player skins including CoverFlow, Minimal, and Vinyl.
- **Library Management**: Manage songs, albums, and playlists (Collections).
- **User System**: Authentication, profiles, and avatar customization.
- **Social Features**: Comments on collections.
- **Content Management**: Upload songs and images, edit metadata.
- **Responsive Design**: Optimized for various screen sizes.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS, Framer Motion
- **Backend**: Supabase (Database, Auth, Storage)
- **Storage**: Tencent COS (Cloud Object Storage) integration

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env.local` and fill in your Supabase and other API credentials:

   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_ENABLE_SIGNUP=true # Set to false to disable new signups
   ```

### Running Locally

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Building for Production

Build the application for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Project Structure

- `components/`: Reusable UI components and specific feature components (skins, modals, etc.).
- `pages/`: Main application pages (Home, Library, Player, etc.).
- `supabase/`: SQL migrations and setup guides.
- `utils/`: Utility functions.
- `hooks/`: Custom React hooks.
- `config/`: Configuration files.

## Database Setup

Refer to [supabase/README.md](supabase/README.md) for instructions on setting up the database schema and migrations.

## AI Studio

View your app in AI Studio: https://ai.studio/apps/drive/1_C3snw5r0RrZt-EwqmApJHMpAwmLDhH7
