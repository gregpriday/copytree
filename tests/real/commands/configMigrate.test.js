/**
 * A migration whose output the next run cannot read has not migrated anything.
 *
 * `config migrate` already validated the values it was about to write, and the
 * comment in the code said exactly that — but it validated them *in memory*.
 * A legacy `~/.copytree/*.js` file is executed, so it can export anything
 * JavaScript can express, and a `Set` slips through every check in between: it
 * satisfies AJV's idea of an object, because it has no own enumerable
 * properties to reject, survives pruning, and then serialises as `!!set` — a
 * tag the loader does not accept.
 *
 * The result was a `config.yaml` this command wrote and the next invocation
 * failed to parse, with the error pointing at the file rather than at the
 * legacy value that caused it. Reading the document back before writing it is
 * the only check that covers the whole class, because it asks the question the
 * user's next run will ask.
 */

import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';

jest.unmock('../../../src/utils/fsx.js');

const CLI = path.resolve(process.cwd(), 'bin/copytree.js');

let legacy;

beforeEach(() => {
  legacy = mkdtempSync(path.join(os.tmpdir(), 'copytree-legacy-config-'));
});

afterEach(() => {
  rmSync(legacy, { recursive: true, force: true });
});

/**
 * Run `config migrate` against a legacy directory holding one executable file.
 *
 * `COPYTREE_LEGACY_CONFIG_PATH` is what makes this hermetic. The legacy
 * directory otherwise resolves to `~/.copytree`, and its `*.js` files are
 * executed — so without the override this would run the developer's own
 * configuration.
 *
 * @param {string} source - CommonJS module body for `copytree.js`
 * @returns {{status: number, stdout: string, stderr: string}} Result
 */
function migrate(source) {
  writeFileSync(path.join(legacy, 'copytree.js'), source);

  const result = spawnSync(process.execPath, [CLI, 'config', 'migrate'], {
    encoding: 'utf8',
    env: { ...process.env, COPYTREE_LEGACY_CONFIG_PATH: legacy },
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('config migrate', () => {
  it('converts plain data, and says where it would go', () => {
    const result = migrate('module.exports = { maxFileSize: 12345 };\n');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('maxFileSize: 12345');
  });

  it('refuses a value it can serialise but not read back', () => {
    // A `Set` at an object-typed position. Valid to AJV, writable by the
    // dumper as `!!set`, and unreadable by the loader.
    const result = migrate("module.exports = { binaryExtensions: new Set(['a', 'b']) };\n");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ERR_CONFIG_INVALID');
    expect(result.stderr).toMatch(/cannot write as YAML/);
  });

  it('names the legacy directory, not the file it has not written', () => {
    // The failure is in the source, and the remediation is there too. Pointing
    // at `config.yaml` would send the reader to a file that does not exist.
    const result = migrate("module.exports = { binaryExtensions: new Set(['a']) };\n");

    expect(result.stderr).toContain(legacy);
  });

  it('emits no YAML at all when it refuses', () => {
    // Not "the document is wrong but here it is anyway". Printing a `!!set`
    // block would invite someone to paste it into place by hand.
    const result = migrate("module.exports = { binaryExtensions: new Set(['a']) };\n");

    expect(result.stdout).not.toContain('!!set');
  });
});
