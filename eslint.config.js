import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * Regeln, die Architekturentscheidungen absichern statt nur Stil zu prüfen.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/web/dev-dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    /*
     * React verlässt sich darauf, dass Hooks bei jedem Rendern in derselben Reihenfolge
     * aufgerufen werden. Ein Hook hinter einem frühen `return` bricht das je nach
     * Ladezustand – und genau das ist beim Einbau der Farbwahl passiert, ohne dass etwas
     * es gemeldet hätte. Diese Regel hätte es gefangen.
     */
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      /*
       * `exhaustive-deps` bleibt aus. Die Ladehaken hier hängen bewusst an `household?.id`
       * und nicht am Objekt: Sonst liefe bei jedem neuen Objekt derselbe Abruf erneut. Die
       * Regel würde sieben solcher Entscheidungen melden, ohne einen Fehler zu finden.
       */
    },
  },
  {
    // Die Domänenschicht muss rein bleiben: keine Uhr, keine Datenbank, kein Netz.
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      // Nicht `Date` selbst ist verboten, sondern der Zugriff auf die *aktuelle* Zeit.
      // `new Date(wert)` bleibt erlaubt – sonst wäre keine Datumsarithmetik möglich.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'In @thealotta/domain kommt die aktuelle Zeit über die injizierte Clock (docs/26 §4).',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'In @thealotta/domain kommt die aktuelle Zeit über die injizierte Clock (docs/26 §4).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@thealotta/db', '**/db/**'], message: '@thealotta/domain darf nicht von der Datenbank abhängen (docs/20 §2).' },
            { group: ['node:fs', 'node:net', 'node:http', 'node:https'], message: 'Die Domänenschicht macht kein I/O.' },
          ],
        },
      ],
    },
  },
  {
    // Der Work-Kontext darf Ownership nicht anfassen (INV-002).
    files: ['packages/services/src/services/work.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@thealotta/db',
              importNames: ['responsibilityAssignments', 'temporaryCoverages'],
              message: 'INV-002: Delegation verändert niemals Ownership.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/test/**/*.ts', '**/*.spec.ts', 'ops/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-restricted-syntax': 'off' },
  },
  {
    /*
     * Messskripte steuern von Node aus einen Browser: Der äußere Teil läuft in Node, die
     * an `page.evaluate` übergebenen Funktionen laufen im Dokument. Beide Kontexte stehen
     * absichtlich in einer Datei – getrennt wäre die Messung schwerer zu lesen als das,
     * was sie misst.
     */
    files: ['ops/scripts/*.mjs'],
    languageOptions: {
      globals: { document: 'readonly', getComputedStyle: 'readonly', console: 'readonly' },
    },
  },
  {
    /** Der Service Worker läuft in einem eigenen globalen Kontext, nicht im Fenster. */
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { self: 'readonly', clients: 'readonly', caches: 'readonly' },
    },
  },
)
