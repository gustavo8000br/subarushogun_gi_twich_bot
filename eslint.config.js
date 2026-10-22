import eslint from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'apps/frontend/.next/**', 'apps/frontend/out/**'],
  },
  {
    files: ['apps/**/*.js', 'apps/**/*.mjs', 'apps/**/*.jsx', 'tests/**/*.js'],
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
    files: ['apps/web/**/*.js', 'apps/frontend/**/*.jsx'],
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
    // OPS-15 S-03: the Next runtime and shared modules must not depend on the vanilla panel tree.
    files: ['apps/frontend/**/*.js', 'apps/frontend/**/*.mjs', 'apps/frontend/**/*.jsx', 'apps/shared/**/*.mjs', 'apps/shared/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/web/*', '**/web/**'],
          message: 'Import shared modules from apps/shared (apps/web is the vanilla panel and will be removed).',
        }],
      }],
    },
  },
];
