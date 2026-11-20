/** Pure helpers for the changed-files lint in `gate:commit` (full lint stays for `gate:push`, `--full` and config changes). */
const LINT_EXT = /\.(ts|tsx|js|cjs|mjs)$/;
const FULL_LINT_RE = [/^eslint\.config\.[^/]*$/, /(^|\/)tsconfig[^/]*\.json$/, /^package\.json$/, /^pnpm-lock\.yaml$/];

/** True when a changed path can alter lint results for files that did not change. */
export const needsFullLint = (paths: readonly string[]): boolean => paths.some((p) => FULL_LINT_RE.some((r) => r.test(p)));

/** Sorted unique lintable paths; `exists` drops deleted files. */
export function lintTargets(paths: readonly string[], exists: (p: string) => boolean = () => true): string[] {
  return [...new Set(paths.filter((p) => p && LINT_EXT.test(p) && exists(p)))].sort();
}

/** Decision: `undefined` = run the full lint, otherwise the files to lint (possibly none). */
export function lintPlan(paths: readonly string[] | undefined, exists?: (p: string) => boolean): string[] | undefined {
  if (!paths || needsFullLint(paths)) return undefined;
  return lintTargets(paths, exists);
}
