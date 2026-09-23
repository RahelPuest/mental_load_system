import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@thealotta/contracts': r('./packages/contracts/src/index.ts'),
      '@thealotta/domain': r('./packages/domain/src/index.ts'),
      '@thealotta/services': r('./packages/services/src/index.ts'),
      '@thealotta/db': r('./packages/db/src/index.ts'),
      '@thealotta/observability': r('./packages/observability/src/index.ts'),
      '@thealotta/crypto': r('./packages/crypto/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/**/test/**/*.spec.ts', 'apps/api/test/**/*.spec.ts', 'apps/worker/test/**/*.spec.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**', 'apps/api/src/services/**'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
