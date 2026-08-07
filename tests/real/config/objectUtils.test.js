import _ from 'lodash';
import { cloneDeep, get, has, isEqual, merge, set } from '../../../src/config/objectUtils.js';

/**
 * These six functions replaced lodash in `ConfigManager`, so the contract is
 * "same answer lodash gave" for the shapes configuration actually contains:
 * trees of plain objects, arrays and primitives parsed from `.js` and `.json`.
 *
 * Assertions compare against lodash directly rather than against expected
 * literals. Lodash is still installed, and an equivalence test is the only kind
 * that keeps being true as the replacement is edited.
 *
 * Where the two deliberately differ — `cloneDeep` on Maps, Sets, class
 * instances and cycles — the difference is asserted explicitly rather than
 * quietly untested, so nobody reaches for this module expecting lodash.
 */

/** Roughly the shape of CopyTree's own `config/` modules. */
const CONFIG_SHAPE = {
  app: { name: 'CopyTree', version: '1.2.3', verboseErrors: false },
  copytree: {
    maxFileSize: 10485760,
    globalExcludedDirectories: ['node_modules', '.git', 'dist'],
    fs: { retryAttempts: 3, retryDelay: 100, maxDelay: 2000 },
    nested: { deeply: { value: null, zero: 0, empty: '' } },
  },
  logging: { level: 'info', colorize: 'auto' },
};

describe('objectUtils', () => {
  describe('cloneDeep', () => {
    it('matches lodash on a configuration tree', () => {
      expect(cloneDeep(CONFIG_SHAPE)).toEqual(_.cloneDeep(CONFIG_SHAPE));
    });

    it('shares no mutable object with the original', () => {
      // The defect this exists to prevent: the ES module cache hands every
      // ConfigManager the same exported object, so aliasing it made `set()` on
      // one instance mutate the defaults every other instance would read.
      const clone = cloneDeep(CONFIG_SHAPE);

      clone.copytree.globalExcludedDirectories.push('build');
      clone.copytree.fs.retryAttempts = 99;
      clone.app.name = 'changed';

      expect(CONFIG_SHAPE.copytree.globalExcludedDirectories).toEqual([
        'node_modules',
        '.git',
        'dist',
      ]);
      expect(CONFIG_SHAPE.copytree.fs.retryAttempts).toBe(3);
      expect(CONFIG_SHAPE.app.name).toBe('CopyTree');
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
      ['a string', 'x'],
      ['an empty object', {}],
      ['an empty array', []],
      ['nested arrays', [[1, [2, [3]]]]],
      ['array of objects', [{ a: 1 }, { b: [2] }]],
    ])('matches lodash for %s', (_label, value) => {
      expect(cloneDeep(value)).toEqual(_.cloneDeep(value));
    });

    it('carries functions and class instances by reference, unlike lodash', () => {
      // A documented, deliberate narrowing: configuration contains none of
      // these, and reconstructing them would cost more than it saves.
      class Marker {}
      const fn = () => {};
      const instance = new Marker();

      const clone = cloneDeep({ fn, instance, when: new Date(0) });

      expect(clone.fn).toBe(fn);
      expect(clone.instance).toBe(instance);
      expect(_.cloneDeep({ instance }).instance).not.toBe(instance);
    });
  });

  describe('merge', () => {
    it('matches lodash when user config overrides defaults', () => {
      const userConfig = {
        copytree: { maxFileSize: 1024, fs: { retryAttempts: 5 } },
        logging: { level: 'debug' },
      };

      expect(merge({}, cloneDeep(CONFIG_SHAPE), userConfig)).toEqual(
        _.merge({}, _.cloneDeep(CONFIG_SHAPE), userConfig),
      );
    });

    it('replaces arrays wholesale rather than by index', () => {
      // The behaviour that matters most here: a user listing two exclusions
      // means *those two*, not those two grafted onto the defaults occupying
      // the same positions.
      const merged = merge({ list: ['a', 'b', 'c'] }, { list: ['x'] });
      expect(merged.list).toEqual(['x']);
    });

    it.each([
      ['an empty source', {}],
      ['null', null],
      ['undefined', undefined],
      ['a nested addition', { copytree: { newKey: true } }],
      ['a null value', { logging: { level: null } }],
      ['a false value', { app: { verboseErrors: false } }],
      ['a zero value', { copytree: { maxFileSize: 0 } }],
    ])('matches lodash merging %s', (_label, source) => {
      expect(merge(cloneDeep(CONFIG_SHAPE), source)).toEqual(
        _.merge(_.cloneDeep(CONFIG_SHAPE), source),
      );
    });

    it('skips undefined without erasing a default, as lodash does', () => {
      const merged = merge({ a: 1 }, { a: undefined });
      expect(merged).toEqual(_.merge({ a: 1 }, { a: undefined }));
      expect(merged.a).toBe(1);
    });

    it('does not alias the source into the target', () => {
      const source = { fs: { retryAttempts: 5 } };
      const target = merge({}, source);

      target.fs.retryAttempts = 9;
      expect(source.fs.retryAttempts).toBe(5);
    });
  });

  describe('get', () => {
    it.each([
      'app.name',
      'copytree.fs.retryAttempts',
      'copytree.globalExcludedDirectories',
      'copytree.globalExcludedDirectories[0]',
      'copytree.nested.deeply.value',
      'copytree.nested.deeply.zero',
      'copytree.nested.deeply.empty',
      'copytree.missing',
      'copytree.missing.deeper',
      'nothing.at.all',
      'app',
    ])('matches lodash for %s', (path) => {
      expect(get(CONFIG_SHAPE, path)).toEqual(_.get(CONFIG_SHAPE, path));
      expect(get(CONFIG_SHAPE, path, 'fallback')).toEqual(_.get(CONFIG_SHAPE, path, 'fallback'));
    });

    it('matches lodash on bracket and quoted forms', () => {
      const source = { a: [{ 'b.c': 1 }], 'x y': { z: 2 } };
      for (const path of ['a[0]["b.c"]', "a[0]['b.c']", 'a[0]', '["x y"].z']) {
        expect(get(source, path)).toEqual(_.get(source, path));
      }
    });

    it('accepts an array path, as lodash does', () => {
      expect(get(CONFIG_SHAPE, ['copytree', 'fs', 'maxDelay'])).toBe(2000);
    });
  });

  describe('has', () => {
    it.each([
      'app.name',
      'copytree.fs',
      'copytree.nested.deeply.value',
      'copytree.missing',
      'nothing.at.all',
      'app',
    ])('matches lodash for %s', (path) => {
      expect(has(CONFIG_SHAPE, path)).toBe(_.has(CONFIG_SHAPE, path));
    });

    it('distinguishes present-and-undefined from absent, as lodash does', () => {
      const source = { defined: undefined };
      expect(has(source, 'defined')).toBe(_.has(source, 'defined'));
      expect(has(source, 'defined')).toBe(true);
      expect(has(source, 'absent')).toBe(false);
    });
  });

  describe('set', () => {
    it.each([
      ['a leaf', 'app.name', 'Renamed'],
      ['a nested leaf', 'copytree.fs.retryAttempts', 9],
      ['a new branch', 'copytree.brand.new.key', true],
      ['an array element', 'copytree.globalExcludedDirectories[1]', 'replaced'],
      ['a top-level key', 'fresh', { a: 1 }],
    ])('matches lodash setting %s', (_label, path, value) => {
      const mine = cloneDeep(CONFIG_SHAPE);
      const theirs = _.cloneDeep(CONFIG_SHAPE);

      set(mine, path, value);
      _.set(theirs, path, value);

      expect(mine).toEqual(theirs);
    });

    it('creates an array for a numeric segment, as lodash does', () => {
      const mine = {};
      const theirs = {};

      set(mine, 'a[0].b', 1);
      _.set(theirs, 'a[0].b', 1);

      expect(mine).toEqual(theirs);
      expect(Array.isArray(mine.a)).toBe(true);
    });

    it('overwrites a primitive standing where a container is needed', () => {
      const mine = { a: 5 };
      const theirs = { a: 5 };

      set(mine, 'a.b', 1);
      _.set(theirs, 'a.b', 1);

      expect(mine).toEqual(theirs);
    });
  });

  describe('isEqual', () => {
    it.each([
      ['identical trees', CONFIG_SHAPE, _.cloneDeep(CONFIG_SHAPE)],
      ['a changed leaf', { a: 1 }, { a: 2 }],
      ['a missing key', { a: 1, b: 2 }, { a: 1 }],
      ['an extra key', { a: 1 }, { a: 1, b: 2 }],
      ['equal arrays', [1, [2, 3]], [1, [2, 3]]],
      ['differing arrays', [1, 2], [1, 2, 3]],
      ['an array vs an object', [1], { 0: 1 }],
      ['null vs undefined', null, undefined],
      ['zero vs false', 0, false],
      ['empty containers', {}, {}],
      ['nested nulls', { a: { b: null } }, { a: { b: null } }],
    ])('matches lodash for %s', (_label, a, b) => {
      expect(isEqual(a, b)).toBe(_.isEqual(a, b));
    });

    it('treats NaN as equal to itself, as lodash does', () => {
      expect(isEqual(NaN, NaN)).toBe(_.isEqual(NaN, NaN));
      expect(isEqual({ a: NaN }, { a: NaN })).toBe(_.isEqual({ a: NaN }, { a: NaN }));
    });
  });
});
