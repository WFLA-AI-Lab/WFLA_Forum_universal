/**
 * Single source of truth for the released version of the project.
 *
 * Bump these when cutting a release; see docs/RELEASE_AND_ARCHIVE.md.
 */
export const APP_VERSION = '0.10.0';
/** Version of the HTTP contract mounted under /api/v1. Breaking changes bump this. */
export const API_VERSION = 'v1';
/** Highest applied file in src/migrations. Compared against the database at boot. */
export const SCHEMA_VERSION = 16;
/** Bumps when the skin contract in frontend/src/skins/contract.ts changes shape. */
export const SKIN_CONTRACT_VERSION = 3;
