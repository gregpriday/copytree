/**
 * A cache defect must only change performance, never output.
 *
 * Three ways this cache could change output instead:
 *
 *  - filenames were the key with every unsupported character replaced by `_`,
 *    which is not injective — `a/b`, `a:b` and `a b` all became `a_b`, so three
 *    distinct entries shared one file and each read back whichever was written
 *    last. For the transform cache that means emitting one file's converted
 *    content in place of another's;
 *  - the entry was written with a plain `writeJson`, so an interrupted write
 *    left truncated JSON that the next read threw on;
 *  - `ttl || defaultTtl` made `ttl: 0` mean "24 hours" rather than "expire
 *    immediately".
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { CacheService } from '../../../src/services/CacheService.js';

jest.unmock('../../../src/utils/fsx.js');

describe('cache integrity', () => {
  let cachePath;

  beforeEach(() => {
    cachePath = mkdtempSync(path.join(os.tmpdir(), 'copytree-cache-'));
  });

  afterEach(() => {
    rmSync(cachePath, { recursive: true, force: true });
  });

  const cache = () => new CacheService({ enabled: true, driver: 'file', cachePath, prefix: '' });

  it('keeps keys distinct that a sanitizing filename would collide', async () => {
    const service = cache();

    await service.set('a/b', 'slash');
    await service.set('a:b', 'colon');
    await service.set('a b', 'space');

    expect(await service.get('a/b')).toBe('slash');
    expect(await service.get('a:b')).toBe('colon');
    expect(await service.get('a b')).toBe('space');

    // Three keys, three files. Under the old naming there was one.
    expect(readdirSync(cachePath)).toHaveLength(3);
  });

  it('treats ttl 0 as immediate expiry rather than the default', async () => {
    const service = cache();
    await service.set('key', 'value', 0);

    expect(await service.get('key', 'MISS')).toBe('MISS');
  });

  it('recomputes rather than throwing when an entry is corrupt', async () => {
    const service = cache();
    await service.set('key', 'value');

    // Exactly what a crash mid-write leaves behind.
    const [file] = readdirSync(cachePath);
    await fs.writeFile(path.join(cachePath, file), '{"value":"trunc');

    // A fresh instance, so the memory tier cannot answer for the disk tier.
    expect(await cache().get('key', 'MISS')).toBe('MISS');
    // And the unreadable entry is gone rather than being re-read every run.
    expect(readdirSync(cachePath)).toHaveLength(0);
  });

  it('leaves no partial file behind when a write is interrupted', async () => {
    const service = cache();
    await service.set('key', 'value');

    // The atomic write renames a complete sibling over the destination, so a
    // reader sees the old entry or the new one — never a `.partial`.
    expect(readdirSync(cachePath).filter((name) => name.includes('partial'))).toEqual([]);
  });
});
