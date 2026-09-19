// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // Block sources (compiler fixtures and content) are data whose exact text is under test.
  globalIgnores([
    '**/dist/',
    '**/node_modules/',
    '**/coverage/',
    '**/test/fixtures/',
    'content/blocks/',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // A switch over a union without a default must list every member, so adding a member
      // (e.g. a new CompileErrorCode) cannot silently fall through.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: false },
      ],
    },
  },

  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // The engine must stay framework-free and runtime-dependency-free (§9.4):
  // contracts may only be referenced for types, and zod / Node built-ins are off limits.
  {
    files: ['packages/typing-engine/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@typing-trainer/contracts',
              allowTypeImports: true,
              message:
                'typing-engine may only import types from contracts. Use `import type` so no zod runtime code is bundled.',
            },
          ],
          patterns: [
            {
              group: ['zod', 'zod/*'],
              message: 'typing-engine must not depend on the zod runtime.',
            },
            {
              group: ['node:*'],
              message: 'typing-engine must run identically in browsers and Node.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Nest modules are empty classes that exist to carry a decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      // The block compiler and its TypeScript dependency must never enter the browser bundle
      // (§9.4). apps/web no longer depends on either; the rule keeps it that way.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@typing-trainer/block-compiler',
              message: 'block-compiler is a build-time package and must not reach the bundle.',
            },
            {
              name: 'typescript',
              message: 'The TypeScript compiler must not reach the browser bundle.',
            },
          ],
        },
      ],
    },
  },

  prettier,
);
