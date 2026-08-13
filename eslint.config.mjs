import eslint from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'dist-electron/**',
      'dist-server/**',
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
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      'electron/**/*.ts',
      'server/**/*.ts',
      'shared/**/*.ts',
      'scripts/**/*.{js,mjs,cjs}',
      '*.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // electron-builder charge encore sa configuration via CommonJS.
    files: ['electron-builder.config.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Ces modules inspectent volontairement des caractères de contrôle aux
    // frontières cryptographiques, HTTP et des URLs provenant du réseau.
    files: [
      'electron/core/updateSignature.ts',
      'server/http/request.ts',
      'server/security/identityToken.ts',
      'server/utils/tiktok.ts',
    ],
    rules: {
      'no-control-regex': 'off',
    },
  },
)
