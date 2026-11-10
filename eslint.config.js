import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Core purity bans (docs: DETERMINISM.md). Messages start with the banned name so the
 * fixture test can assert each ban fires. Flat config replaces rule options rather than merging
 * them, so the full lists live in this single block.
 */
const bannedGlobals = [
  'Date',
  'performance',
  'window',
  'document',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'crypto',
  'fetch',
  'localStorage',
  'navigator',
].map((name) => ({ name, message: `${name} is banned in src/core (determinism).` }));

const bannedMath = [
  'random',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'hypot',
].map((property) => ({
  object: 'Math',
  property,
  message: `Math.${property} is banned in src/core (determinism).`,
}));

const bannedProperties = [
  ...bannedMath,
  { object: 'Date', property: 'now', message: 'Date.now is banned in src/core (determinism).' },
];

const bannedSyntax = [
  { selector: "BinaryExpression[operator='**']", message: '** is banned in src/core (use LUTs).' },
  {
    selector: "AssignmentExpression[operator='**=']",
    message: '**= is banned in src/core (use LUTs).',
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message: 'new Date is banned in src/core (determinism).',
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: 'toFixed is banned in src/core (no formatting in logic).',
  },
];

const bannedImports = {
  paths: [
    { name: 'phaser', message: 'phaser is banned in src/core.' },
    { name: 'node:*', message: 'node:* is banned in src/core.' },
  ],
  patterns: [
    { group: ['phaser/*'], message: 'phaser is banned in src/core.' },
    { group: ['@game/*'], message: '@game/* is banned in src/core.' },
    { group: ['@ui/*'], message: '@ui/* is banned in src/core.' },
    { group: ['@testing/*'], message: '@testing/* is banned in src/core.' },
    { group: ['node:*'], message: 'node:* is banned in src/core.' },
    {
      group: ['**/game/**', '**/ui/**', '**/testing/**'],
      message: 'relative paths escaping core are banned in src/core.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '.claude/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'war/**',
      'imgWorkArea/**',
      'visio/**',
      'tools/**',
      'docs/**',
      'tests/lint/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
    rules: tseslint.configs.disableTypeChecked.rules,
  },
  {
    files: ['src/game/**/*.ts', 'src/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@core/*/**'], message: 'Import core only through @core/index.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts', 'tests/lint/fixtures/*.core.ts'],
    rules: {
      'no-restricted-globals': ['error', ...bannedGlobals],
      'no-restricted-properties': ['error', ...bannedProperties],
      'no-restricted-syntax': ['error', ...bannedSyntax],
      'no-restricted-imports': ['error', bannedImports],
    },
  },
  prettier,
);
