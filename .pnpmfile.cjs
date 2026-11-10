// typescript-eslint cannot run on TypeScript 7 yet, so give it the side-by-side TS 6 API
// (@typescript/typescript6) while the repo itself compiles with TypeScript 7.
const ts6 = 'npm:@typescript/typescript6@^6.0.2';

function readPackage(pkg) {
  const isTsEslint =
    pkg.name === 'typescript-eslint' ||
    pkg.name.startsWith('@typescript-eslint/') ||
    pkg.name === 'ts-api-utils';
  if (isTsEslint) {
    for (const field of ['peerDependencies', 'peerDependenciesMeta']) {
      if (pkg[field]) delete pkg[field].typescript;
    }
    pkg.dependencies = { ...pkg.dependencies, typescript: ts6 };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
