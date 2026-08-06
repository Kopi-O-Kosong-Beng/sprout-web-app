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
    // The form suites type character-by-character through userEvent; on a dev
    // machine that is also running both dev servers they brush the 5s default
    // and flake, while passing in isolation and in CI. Timing headroom, not a
    // license for slow tests.
    testTimeout: 15_000,
  },
});
