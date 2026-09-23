import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Die .env liegt im Wurzelverzeichnis des Monorepos, damit API, Worker und Weboberfläche
// dieselbe Konfiguration teilen.
const ENV_DIR = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  // VITE_API_URL überschreibt das Proxy-Ziel – nützlich, wenn Port 3000 lokal schon
  // belegt ist (Obsidian, Grafana und andere Werkzeuge nutzen ihn gern).
  const env = loadEnv(mode, ENV_DIR, 'VITE_')
  const apiTarget = env['VITE_API_URL'] ?? 'http://127.0.0.1:3000'

  return {
    envDir: ENV_DIR,
    plugins: [react()],
    resolve: {
      alias: {
        '@thealotta/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    // Für die Browserprüfung: gegen das gebaute Bündel testen, nicht gegen den
    // Entwicklungsserver. Der übersetzt Module erst beim Aufruf – unter Last führt das zu
    // Wartezeiten, die es im Betrieb nicht gibt, und damit zu sprunghaften Tests.
    preview: {
      port: 4173,
      strictPort: true,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          // React und Router ändern sich selten – als eigener Brocken bleiben sie im Cache.
          manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
        },
      },
    },
  }
})
