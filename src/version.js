import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The package version, read once per process.
 *
 * `package.json` was being opened and parsed independently by the CLI entry
 * point and by the copy command, so every invocation paid for the same read and
 * the same JSON parse twice — and the two could disagree if one of them fell
 * back after a failure. One module, one read, one answer.
 *
 * The fallback covers the test environment and any packaging arrangement where
 * the manifest is not beside the source; a missing version must not stop a copy.
 *
 * @type {string}
 */
export const VERSION = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(path.join(here, '../package.json'), 'utf8')).version;
  } catch {
    return '0.0.0-test';
  }
})();

export default VERSION;
