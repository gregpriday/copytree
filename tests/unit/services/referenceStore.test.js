/**
 * Reference-file retention.
 *
 * A reference copy hands an agent a path and exits, so the file has to outlive
 * the process. That makes reclaiming it someone else's job, on a policy — and
 * makes a mistake here a deleted file somebody is still reading.
 */

import os from 'os';
import path from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, utimesSync } from 'fs';

jest.unmock('../../../src/utils/fsx.js');

let collectReferenceFiles;
let referenceStatus;
let REFERENCE_ROOT;
let sandbox;

beforeAll(async () => {
  // `REFERENCE_ROOT` is resolved at import time, so the override has to be in
  // place before the module is loaded — and the module registry has to be
  // cleared, or an earlier suite's copy is reused and this one would operate on
  // the real temp directory.
  sandbox = mkdtempSync(path.join(os.tmpdir(), 'copytree-refstore-'));
  process.env.COPYTREE_REFERENCE_PATH = path.join(sandbox, 'copytree');

  jest.resetModules();

  const store = await import('../../../src/services/referenceStore.js');
  collectReferenceFiles = store.collectReferenceFiles;
  referenceStatus = store.referenceStatus;
  ({ REFERENCE_ROOT } = await import('../../../src/utils/outputDestination.js'));

  // This suite deletes directories. If the override did not take, it would be
  // deleting the developer's real reference files.
  expect(REFERENCE_ROOT.startsWith(sandbox)).toBe(true);
});

afterAll(() => {
  delete process.env.COPYTREE_REFERENCE_PATH;
  rmSync(sandbox, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(REFERENCE_ROOT, { recursive: true, force: true });
});

/**
 * Write a reference file, optionally aged.
 * @param {string} project - Project slug
 * @param {string} name - File name
 * @param {number} [ageDays=0] - How long ago it was written
 * @returns {string} Absolute path
 */
function writeReference(project, name, ageDays = 0) {
  const dir = path.join(REFERENCE_ROOT, project);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, 'x'.repeat(10));

  if (ageDays > 0) {
    const when = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    utimesSync(file, when, when);
  }
  return file;
}

describe('referenceStatus', () => {
  it('reports nothing when no reference has ever been written', async () => {
    const status = await referenceStatus();

    expect(status.entries).toBe(0);
    expect(status.bytes).toBe(0);
    expect(status.oldest).toBeNull();
    expect(status.newest).toBeNull();
    expect(status.path).toBe(REFERENCE_ROOT);
  });

  it('counts files and bytes across every project', async () => {
    writeReference('alpha', 'a.xml');
    writeReference('beta', 'b.xml');

    const status = await referenceStatus();

    expect(status.entries).toBe(2);
    expect(status.bytes).toBe(20);
    expect(status.oldest).not.toBeNull();
  });
});

describe('collectReferenceFiles', () => {
  it('keeps files inside the retention window and removes the ones outside it', async () => {
    const fresh = writeReference('alpha', 'fresh.xml');
    const stale = writeReference('alpha', 'stale.xml', 10);

    const reclaimed = await collectReferenceFiles({ retentionDays: 7 });

    expect(reclaimed.removed).toBe(1);
    expect(reclaimed.bytes).toBe(10);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(stale)).toBe(false);
  });

  it('treats the cutoff as "older than", not "at least"', async () => {
    // Exactly at the boundary, so a `<=` where a `<` belongs would delete it.
    const boundary = writeReference('alpha', 'boundary.xml', 7);

    await collectReferenceFiles({ retentionDays: 8 });
    expect(existsSync(boundary)).toBe(true);
  });

  it('removes everything under `all`, whatever its age', async () => {
    const fresh = writeReference('alpha', 'fresh.xml');

    const reclaimed = await collectReferenceFiles({ all: true });

    expect(reclaimed.removed).toBe(1);
    expect(existsSync(fresh)).toBe(false);
  });

  it('removes nothing with a retention window nothing has outlived', async () => {
    const fresh = writeReference('alpha', 'fresh.xml');

    const reclaimed = await collectReferenceFiles({ retentionDays: 365 });

    expect(reclaimed.removed).toBe(0);
    expect(existsSync(fresh)).toBe(true);
  });

  it('removes a project directory only once it is genuinely empty', async () => {
    writeReference('alpha', 'stale.xml', 10);
    const kept = writeReference('beta', 'fresh.xml');

    await collectReferenceFiles({ retentionDays: 7 });

    expect(existsSync(path.join(REFERENCE_ROOT, 'alpha'))).toBe(false);
    expect(existsSync(kept)).toBe(true);
    expect(existsSync(path.join(REFERENCE_ROOT, 'beta'))).toBe(true);
  });

  // The directory cleanup used to list a directory and then remove it
  // recursively. A copy writing a reference between those two operations had
  // its brand-new file deleted.
  it('does not delete a reference written while it is cleaning up', async () => {
    writeReference('alpha', 'stale.xml', 10);

    const fsx = (await import('../../../src/utils/fsx.js')).default;
    const realReaddir = fsx.readdir;
    let raced = false;

    jest.spyOn(fsx, 'readdir').mockImplementation(async (target, options) => {
      const entries = await realReaddir(target, options);
      // Simulate a concurrent copy the instant the root listing is taken.
      if (!raced && path.resolve(target) === path.resolve(REFERENCE_ROOT)) {
        raced = true;
        writeReference('alpha', 'brand-new.xml');
      }
      return entries;
    });

    try {
      await collectReferenceFiles({ retentionDays: 7 });
    } finally {
      fsx.readdir.mockRestore();
    }

    expect(existsSync(path.join(REFERENCE_ROOT, 'alpha', 'brand-new.xml'))).toBe(true);
  });

  it('survives a reference directory that was never created', async () => {
    rmSync(REFERENCE_ROOT, { recursive: true, force: true });
    await expect(collectReferenceFiles()).resolves.toEqual({ removed: 0, bytes: 0 });
  });
});
