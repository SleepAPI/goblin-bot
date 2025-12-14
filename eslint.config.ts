/* eslint-disable @typescript-eslint/no-explicit-any */

import typescriptEslint from 'typescript-eslint';

import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default typescriptEslint.config(
  {
    ignores: ['**/node_modules', '**/dist', '**/coverage', '**/.vscode', '*.d.ts', '**/cache/**']
  },

  // general recommendations
  {
    name: 'goblin-bot/base',
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.node
      },
      sourceType: 'module',
      parser: tsParser
    },
    plugins: { ts }
  },

  js.configs.recommended,
  typescriptEslint.configs.recommended,
  prettierConfig,
  prettierRecommended as any, // prettier last to avoid clash with autoformatting

  // final overwrite custom rules
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports'
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          reportUsedIgnorePattern: true
        }
      ]
    }
  }
);
