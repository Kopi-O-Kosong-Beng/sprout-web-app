/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  // Tailwind v4 runs as a Vite plugin — there is no tailwind.config.js. The
  // theme is declared in src/index.css via @theme, and both the pixel-art game
  // screens and the studio section draw their tokens from it.
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
});
