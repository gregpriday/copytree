/**
 * The durability contract for every file CopyTree writes.
 *
 * What these tests are really protecting is the *previous* export. A run that
 * fails or is cancelled halfway used to leave either nothing or half a document
 * at the destination, and the half-document is the worse outcome, because it
 * parses far enough to look real.
 */

import os from 'os';
import path from 'path';
import { mkdtemp, readFile, writeFile, readdir, stat, rm } from 'fs/promises';
import { writeFileAtomic, openAtomicWriteStream } from '../../../src/utils/atomicWrite.js';

let dir;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'copytree-atomic-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('writes the file', async () => {
    const target = path.join(dir, 'out.xml');

    await writeFileAtomic(target, '<doc/>');

    expect(await readFile(target, 'utf8')).toBe('<doc/>');
  });

  it('creates missing parent directories', async () => {
    const target = path.join(dir, 'nested', 'deep', 'out.xml');

    await writeFileAtomic(target, 'hello');

    expect(await readFile(target, 'utf8')).toBe('hello');
  });

  it('replaces an existing file', async () => {
    const target = path.join(dir, 'out.xml');
    await writeFile(target, 'old');

    await writeFileAtomic(target, 'new');

    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('leaves no temporary file behind', async () => {
    await writeFileAtomic(path.join(dir, 'out.xml'), 'content');

    expect(await readdir(dir)).toEqual(['out.xml']);
  });

  it('creates the file readable only by its owner', async () => {
    const target = path.join(dir, 'out.xml');

    await writeFileAtomic(target, 'secret');

    // An export can carry redacted secrets, source and private paths.
    const mode = (await stat(target)).mode & 0o777;
    expect(mode & 0o077).toBe(0);
  });

  it('reports a typed failure and keeps the destination when the write fails', async () => {
    // A directory where a file should be: the rename cannot succeed.
    const target = path.join(dir, 'blocked');
    await writeFileAtomic(path.join(target, 'child'), 'x');

    await expect(writeFileAtomic(target, 'content')).rejects.toMatchObject({
      name: 'FileSystemError',
    });

    // And nothing partial is left lying around next to it.
    expect((await readdir(dir)).filter((e) => e.includes('.partial'))).toEqual([]);
  });
});

describe('openAtomicWriteStream', () => {
  it('commits the complete document', async () => {
    const target = path.join(dir, 'out.xml');
    const handle = await openAtomicWriteStream(target);

    await handle.write('<a>');
    await handle.write('</a>');
    await handle.commit();

    expect(await readFile(target, 'utf8')).toBe('<a></a>');
    expect(await readdir(dir)).toEqual(['out.xml']);
  });

  it('does not touch the destination before commit', async () => {
    const target = path.join(dir, 'out.xml');
    await writeFile(target, 'previous');

    const handle = await openAtomicWriteStream(target);
    await handle.write('partial document');

    // This is the whole point: a reader looking now still sees the old export.
    expect(await readFile(target, 'utf8')).toBe('previous');

    await handle.abort();
  });

  it('leaves the previous file intact when aborted', async () => {
    const target = path.join(dir, 'out.xml');
    await writeFile(target, 'previous');

    const handle = await openAtomicWriteStream(target);
    await handle.write('half a document');
    await handle.abort();

    expect(await readFile(target, 'utf8')).toBe('previous');
    expect(await readdir(dir)).toEqual(['out.xml']);
  });

  it('writes nothing at all when a new file is aborted', async () => {
    const handle = await openAtomicWriteStream(path.join(dir, 'out.xml'));
    await handle.write('half a document');
    await handle.abort();

    expect(await readdir(dir)).toEqual([]);
  });

  it('aborts when its signal fires', async () => {
    const controller = new AbortController();
    const target = path.join(dir, 'out.xml');
    const handle = await openAtomicWriteStream(target, { signal: controller.signal });

    await handle.write('half');
    controller.abort();
    // `abort()` returns the cleanup the signal already started, so awaiting it
    // is how a caller knows the temporary file is actually gone.
    await handle.abort();

    expect(await readdir(dir)).toEqual([]);
  });

  it('uses an unpredictable temporary name', async () => {
    const first = await openAtomicWriteStream(path.join(dir, 'out.xml'));
    const second = await openAtomicWriteStream(path.join(dir, 'out.xml'));

    // A fixed `<target>.partial` in a shared directory is a name another local
    // user can create first.
    expect(first.path).not.toBe(second.path);

    await first.abort();
    await second.abort();
  });

  it('refuses to open when its signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      openAtomicWriteStream(path.join(dir, 'out.xml'), { signal: controller.signal }),
    ).rejects.toThrow();

    // Nothing created, so nothing to clean up later.
    expect(await readdir(dir)).toEqual([]);
  });

  it('does not replace the destination when aborted while committing', async () => {
    const controller = new AbortController();
    const target = path.join(dir, 'out.xml');
    await writeFile(target, 'previous');

    const handle = await openAtomicWriteStream(target, { signal: controller.signal });
    await handle.write('a complete new document');

    // Abort after the last write but before the rename.
    controller.abort();
    await expect(handle.commit()).rejects.toThrow();
    // The signal's own cleanup is already in flight; `abort()` returns it, which
    // is what a caller's `finally` would await.
    await handle.abort();

    expect(await readFile(target, 'utf8')).toBe('previous');
    expect(await readdir(dir)).toEqual(['out.xml']);
  });

  it('does not leave a waiting writer hanging when aborted mid-write', async () => {
    const controller = new AbortController();
    const handle = await openAtomicWriteStream(path.join(dir, 'out.xml'), {
      signal: controller.signal,
    });

    // Enough to exceed the high-water mark, so `write()` has to wait. An abort
    // emits `close` and never `drain`; a waiter listening only for `drain`
    // would never be released.
    const big = 'x'.repeat(1024 * 1024);
    const pending = (async () => {
      for (let i = 0; i < 64; i += 1) await handle.write(big);
    })();

    controller.abort();

    await expect(pending).rejects.toThrow();
    await handle.abort();
  }, 15000);

  it('refuses to write after settling', async () => {
    const handle = await openAtomicWriteStream(path.join(dir, 'out.xml'));
    await handle.write('done');
    await handle.commit();

    await expect(handle.write('more')).rejects.toThrow(/settled/);
  });
});
