import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * Zweites Vitest-Projekt: die Oberfläche.
 *
 * Bis zum dritten Durchgang war jede Aussage über Barrierefreiheit, leere Zustände,
 * Fehlerzustände und lange Namen eine Behauptung ohne Prüfung (docs/44 §1). Diese
 * Konfiguration macht die „Definition of Done pro View" (Auftrag §67) maschinell prüfbar.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@thealotta/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    globals: false,
    environment: 'jsdom',
    include: ['apps/web/test/**/*.spec.{ts,tsx}'],
    setupFiles: ['./apps/web/test/setup.ts'],
    testTimeout: 20_000,
  },
})
