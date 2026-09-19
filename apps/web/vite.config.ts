import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The API in development; the proxy below keeps the browser on one origin (§7 CSRF, §9.4). */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Requests stay same-origin for the browser, so the session cookie is sent and the Origin
    // header the API checks is the app's own origin.
    proxy: { '/api': { target: API_TARGET } },
  },
});
