/**
 * The global `fsx` mock must have exactly the surface the real module has.
 *
 * The hand-written list this replaced diverged in both directions at once. It
 * declared thirteen names `src/utils/fsx.js` does not export — `unlink`,
 * `copy`, `move`, `outputFile`, `mkdtempSync` and friends, left over from when
 * this wrapped `fs-extra` — so two tests were written against, and passed
 * against, an API that does not exist in production. And it omitted sixteen
 * names the real module does export, so any code path reaching one of those got
 * `undefined` and failed for a reason that had nothing to do with the code
 * under test.
 *
 * The mock is derived from the real module now. This is the assertion that
 * keeps it that way, and that keeps the defaults table honest.
 */

import fsx from '../../src/utils/fsx.js';

describe('the global fsx mock', () => {
  const registered = globalThis.__COPYTREE_FSX_MOCK__;

  it('is installed for this Jest project', () => {
    expect(registered).toBeDefined();
    expect(jest.isMockFunction(fsx.readFile)).toBe(true);
  });

  it('arms only names the real module actually exports', () => {
    const actual = jest.requireActual('../../src/utils/fsx.js');
    const real = new Set(Object.keys(actual.default ?? actual));

    const phantom = Object.keys(registered.defaults).filter((name) => !real.has(name));
    expect(phantom).toEqual([]);
  });

  it('mocks every function the real module exports, and passes classes through', () => {
    const actual = jest.requireActual('../../src/utils/fsx.js');
    const source = actual.default ?? actual;
    // Classes are functions, so a bare `typeof === 'function'` rule replaced
    // these with `jest.fn()` — which no `instanceof` check or `new` call can
    // use.
    const classes = new Set(['Dirent', 'Stats']);

    for (const [name, value] of Object.entries(source)) {
      if (typeof value === 'function' && !classes.has(name)) {
        expect(jest.isMockFunction(fsx[name])).toBe(true);
      } else {
        expect(fsx[name]).toBe(value);
      }
    }

    for (const name of classes) {
      expect(jest.isMockFunction(fsx[name])).toBe(false);
      expect(fsx[name]).toBe(source[name]);
    }
  });

  it('re-arms the declared defaults before each test', async () => {
    // `resetMocks: true` strips implementations between tests, including the
    // one passed to `jest.fn(impl)`. Without the re-arming in `tests/setup.js`,
    // `readFile` resolved to `undefined` in every test in this project — and
    // that went unnoticed because `FileLoadingStage` used to swallow the
    // resulting TypeError into the exported file content.
    await expect(fsx.readFile('/anything')).resolves.toBeInstanceOf(Buffer);
    await expect(fsx.readFile('/anything', 'utf8')).resolves.toBe('');
    await expect(fsx.pathExists('/anything')).resolves.toBe(true);
    await expect(fsx.readdir('/anything')).resolves.toEqual([]);
  });

  it('lets a test override a default without the re-arming fighting it', () => {
    fsx.existsSync.mockReturnValue(true);
    expect(fsx.existsSync('/anything')).toBe(true);
  });
});
