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
  // Escape hatches to the banned names above, and host-dependent or GC-dependent behaviour.
  'globalThis',
  'self',
  'global',
  'Intl',
  'WeakRef',
  'FinalizationRegistry',
  'queueMicrotask',
  'Reflect',
].map((name) => ({ name, message: `${name} is banned in src/core (determinism).` }));

/** The only Math members core may touch: exactly specified by IEEE 754 / ECMAScript. */
const allowedMath = ['sqrt', 'floor', 'ceil', 'round', 'trunc', 'abs', 'min', 'max', 'fround', 'imul', 'sign', 'clz32'];

/** Formatting and locale-aware comparison: host-locale dependent, and never sim logic. */
const bannedMembers = [
  'toFixed',
  'toPrecision',
  'toExponential',
  'toLocaleString',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
  'localeCompare',
];

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
  ...bannedMembers.flatMap((name) => [
    {
      selector: `MemberExpression[property.name='${name}']`,
      message: `${name} is banned in src/core (no locale or formatting in logic).`,
    },
    {
      selector: `MemberExpression[computed=true][property.value='${name}']`,
      message: `${name} is banned in src/core (no locale or formatting in logic).`,
    },
  ]),
  {
    selector: "MemberExpression[computed=true][object.name='Math']",
    message: 'Math[...] is banned in src/core (computed access bypasses the Math bans).',
  },
  {
    selector: `MemberExpression[computed=false][object.name='Math']:not([property.name=/^(${allowedMath.join('|')})$/])`,
    message: `Math member is banned in src/core (allowed: ${allowedMath.join(' ')}).`,
  },
  {
    selector: "Identifier[name='Math']:not(MemberExpression > Identifier.object)",
    message: 'Math as a value is banned in src/core (aliasing bypasses the Math bans).',
  },
  {
    selector: "CallExpression[arguments.length=0][callee.property.name=/^(sort|toSorted)$/]",
    message: 'sort() without a comparator is banned in src/core (pass a total comparator).',
  },
  { selector: 'AwaitExpression', message: 'await is banned in src/core (the step is synchronous).' },
  { selector: 'ForOfStatement[await=true]', message: 'await is banned in src/core (the step is synchronous).' },
  { selector: ':function[async=true]', message: 'async functions are banned in src/core (the step is synchronous).' },
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
      'dist-pages/**',
      'dist-itch/**',
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
