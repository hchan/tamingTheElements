/** Layer boundaries from docs plan section 1.1. See ADR 0017. */
const TEST_FILE = '\\.(test|spec)\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No cycles anywhere.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-pure',
      severity: 'error',
      comment: 'src/core must not import phaser, game, ui, testing or node builtins.',
      from: { path: '^src/core/' },
      to: {
        path: ['^src/(game|ui|testing)/', '(^|/)node_modules/phaser/', '^phaser(/|$)'],
      },
    },
    {
      name: 'core-no-node-builtins',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'core-only-valibot-in-save',
      severity: 'error',
      comment: 'Third-party packages in src/core: valibot, and only from src/core/save/.',
      from: { path: '^src/core/', pathNot: ['^src/core/save/', TEST_FILE] },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'core-npm-allowlist',
      severity: 'error',
      from: { path: '^src/core/save/', pathNot: TEST_FILE },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg', 'npm-unknown'],
        pathNot: '(^|/)node_modules/valibot/',
      },
    },
    {
      name: 'ui-layering',
      severity: 'error',
      comment: 'src/ui may import @core/index and src/game/platform only; never phaser or testing.',
      from: { path: '^src/ui/' },
      to: {
        path: ['^src/testing/', '(^|/)node_modules/phaser/', '^phaser(/|$)', '^src/game/(?!platform/)'],
      },
    },
    {
      name: 'game-layering',
      severity: 'error',
      comment: 'src/game (except app/) must not import src/ui or src/testing.',
      from: { path: '^src/game/', pathNot: '^src/game/app/' },
      to: { path: '^src/(ui|testing)/' },
    },
    {
      name: 'core-only-via-index',
      severity: 'error',
      comment: 'game and ui reach core only through @core/index (or @core/menu-index for the menu entry graph, @core/lazy-index for lazily loaded chunks).',
      from: { path: '^src/(game|ui)/' },
      to: { path: '^src/core/', pathNot: '^src/core/(index|menu-index|lazy-index)\\.ts$' },
    },
    {
      name: 'platform-is-leaf',
      severity: 'error',
      comment: 'src/game/platform imports only core (via index) and itself.',
      from: { path: '^src/game/platform/' },
      to: { path: '^src/(game|ui)/', pathNot: '^src/game/platform/' },
    },
    {
      name: 'not-to-testing',
      severity: 'error',
      comment: 'Nothing in src outside src/testing and test files may import src/testing.',
      from: { path: '^src/', pathNot: ['^src/testing/', TEST_FILE] },
      to: { path: '^src/testing/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    // dependency-cruiser cannot use typescript >= 7 yet, so @swc/core transpiles instead.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
