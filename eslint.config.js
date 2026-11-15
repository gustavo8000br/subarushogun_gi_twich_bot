import eslint from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'apps/frontend/.next/**', 'apps/frontend/out/**'],
  },
  {
    files: ['apps/**/*.js', 'apps/**/*.mjs', 'apps/**/*.jsx', 'tests/**/*.js', 'tests/**/*.mjs', 'tests/**/*.jsx'],
    ...eslint.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/frontend/**/*.jsx'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        FormData: 'readonly',
        React: 'readonly',
      },
    },
  },
  {
    // P-02: tests/**/*.{mjs,jsx} were skipped silently; jsdom unit tests and browser-only e2e scripts use DOM globals.
    files: ['tests/**/*.mjs', 'tests/**/*.jsx'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        Storage: 'readonly',
        WebSocket: 'readonly',
        performance: 'readonly',
        structuredClone: 'readonly',
        getComputedStyle: 'readonly',
        CSS: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        DOMException: 'readonly',
        HTMLDialogElement: 'readonly',
        FormData: 'readonly',
        React: 'readonly',
      },
    },
    rules: {
      // Classic JSX transform in tests needs the React import even though ESLint cannot see the JSX use.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^React$' }],
    },
  },
  {
    // OPS-15 S-03: the Next runtime and shared modules must not depend on the vanilla panel tree.
    files: ['apps/frontend/**/*.js', 'apps/frontend/**/*.mjs', 'apps/frontend/**/*.jsx', 'apps/shared/**/*.mjs', 'apps/shared/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/web/*', '**/web/**'],
          message: 'Import shared modules from apps/shared; the vanilla panel tree no longer exists.',
        }],
      }],
    },
  },
];
