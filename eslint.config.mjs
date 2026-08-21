import eslint from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'coverage/**',
      'apps/*/dist/**',
      'apps/*/dist-*/**',
      'dist/**',
      'dist-*/**',
      'node_modules/**',
      'release/**',
      'releases/**',
      '*.tsbuildinfo',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['apps/desktop/renderer/**/*.{ts,vue}', 'apps/web/src/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      'apps/desktop/electron/**/*.ts',
      'apps/desktop/shared/**/*.ts',
      'apps/desktop/scripts/**/*.{js,mjs,cjs}',
      'apps/server/src/**/*.ts',
      'apps/server/scripts/**/*.{js,mjs,cjs}',
      'apps/*/*.{js,mjs,cjs,ts}',
      'packages/**/*.ts',
      '*.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // electron-builder charge encore sa configuration via CommonJS.
    files: ['apps/desktop/electron-builder.config.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Ces modules inspectent volontairement des caractères de contrôle aux
    // frontières cryptographiques, HTTP et des URLs provenant du réseau.
    files: [
      'apps/desktop/electron/core/updateSignature.ts',
      'apps/server/src/http/request.ts',
      'apps/server/src/security/identityToken.ts',
      'apps/server/src/utils/tiktok.ts',
    ],
    rules: {
      'no-control-regex': 'off',
    },
  },
)
