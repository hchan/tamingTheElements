import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The legacy Crafty game (`war/`) is no longer in the tree. `pnpm oracle:restore` extracts it from the git tag
 * `legacy-crafty-1.0` into the gitignored `.oracle/` directory; oracle-executing tests and the asset generators read it
 * from there. Override the directory with TTE_ORACLE_DIR (absolute path of a directory that contains `war/`).
 */
export const ORACLE_ROOT = process.env['TTE_ORACLE_DIR'] ?? resolve(import.meta.dirname, '../../../.oracle');
export const ORACLE_WAR = resolve(ORACLE_ROOT, 'war');
export const ORACLE_PRIVATE = resolve(ORACLE_WAR, 'WEB-INF/private');

export const oracleAvailable = (): boolean => existsSync(resolve(ORACLE_PRIVATE, 'index.html'));
