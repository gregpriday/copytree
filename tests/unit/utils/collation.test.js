import {
  allPlainAscii,
  ASCII_COLLATION_WEIGHTS,
  comparatorFor,
  compareCollated,
  comparePlain,
  isPlainAscii,
} from '../../../src/utils/collation.js';

/**
 * The collator `compareCollated` claims to reproduce.
 *
 * Every assertion below is written against this rather than against expected
 * literals, because the property that matters is not "this ordering" but "the
 * same ordering ICU gives". A hand-written expectation would pass while the two
 * silently diverged.
 */
const ICU = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Printable ASCII, which is the range the frozen table covers. */
const PRINTABLE = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i));

describe('collation', () => {
  describe('agreement with ICU', () => {
    it('orders every pair of printable ASCII characters identically', () => {
      const disagreements = [];

      for (const a of PRINTABLE) {
        for (const b of PRINTABLE) {
          if (Math.sign(compareCollated(a, b)) !== Math.sign(ICU.compare(a, b))) {
            disagreements.push(`${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
          }
        }
      }

      expect(disagreements).toEqual([]);
    });

    it('agrees on random ASCII strings', () => {
      // Seeded so a failure is reproducible: a collation bug that only appears
      // on one CI run in ten is worse than no test.
      let seed = 0x2f6e2b1;
      const random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const pick = () => PRINTABLE[Math.floor(random() * PRINTABLE.length)];
      const word = () => {
        let out = '';
        for (let i = 0, n = 1 + Math.floor(random() * 10); i < n; i++) out += pick();
        return out;
      };

      const disagreements = [];
      for (let i = 0; i < 20000; i++) {
        const a = word();
        const b = word();
        if (Math.sign(compareCollated(a, b)) !== Math.sign(ICU.compare(a, b))) {
          disagreements.push(`${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
        }
      }

      expect(disagreements.slice(0, 10)).toEqual([]);
    });

    it.each([
      ['file9', 'file10'],
      ['v1.9', 'v1.10'],
      ['a007', 'a7'],
      ['a0', 'a00'],
      ['1', '01'],
      ['README.md', 'readme.md'],
      ['src/a.js', 'src/B.js'],
      ['a-b', 'a_b'],
      ['a.b', 'a-b'],
      ['', 'a'],
      ['a', 'ab'],
    ])('agrees on %s vs %s', (a, b) => {
      expect(Math.sign(compareCollated(a, b))).toBe(Math.sign(ICU.compare(a, b)));
      expect(Math.sign(compareCollated(b, a))).toBe(Math.sign(ICU.compare(b, a)));
    });

    it('sorts a realistic file list into the same order as ICU', () => {
      const paths = [
        'src/index.js',
        'src/Index.js',
        'src/utils/file10.js',
        'src/utils/file9.js',
        'README.md',
        '.gitignore',
        'package.json',
        'src/a-b.js',
        'src/a_b.js',
        'tests/e2e/output-formats.test.js',
      ];

      expect([...paths].sort(compareCollated)).toEqual([...paths].sort(ICU.compare.bind(ICU)));
    });
  });

  describe('non-ASCII fallback', () => {
    it.each([
      ['café', 'cafe'],
      ['日本語.md', 'nihongo.md'],
      ['Ünicode', 'unicode'],
      ['naïve.js', 'naive.js'],
    ])('defers to the collator for %s vs %s', (a, b) => {
      expect(Math.sign(compareCollated(a, b))).toBe(Math.sign(ICU.compare(a, b)));
    });

    it('recognises which strings the table covers', () => {
      expect(isPlainAscii('src/index.js')).toBe(true);
      expect(isPlainAscii('a b~z')).toBe(true);
      expect(isPlainAscii('café')).toBe(false);
      expect(isPlainAscii('tab\there')).toBe(false);
      expect(isPlainAscii('nl\n')).toBe(false);
    });
  });

  describe('comparatorFor', () => {
    it('sorts an all-ASCII collection exactly as ICU does', () => {
      const paths = [
        'src/index.js',
        'src/Index.js',
        'src/utils/file10.js',
        'src/utils/file9.js',
        'README.md',
        '.gitignore',
      ];

      expect([...paths].sort(comparatorFor(paths))).toEqual([...paths].sort(ICU.compare.bind(ICU)));
    });

    it('sorts a collection containing non-ASCII exactly as ICU does', () => {
      // One accented filename is enough to send the whole collection to the
      // collator, because the fast comparator is only defined on ASCII.
      const paths = ['café.md', 'src/index.js', 'README.md', '日本語.txt'];

      expect([...paths].sort(comparatorFor(paths))).toEqual([...paths].sort(ICU.compare.bind(ICU)));
    });

    it('agrees with compareCollated on every pair it is given', () => {
      const paths = ['a10', 'a9', 'A9', 'b', '_x', 'x_', 'file-1', 'file_1'];
      const compare = comparatorFor(paths);

      for (const a of paths) {
        for (const b of paths) {
          expect(Math.sign(compare(a, b))).toBe(Math.sign(compareCollated(a, b)));
        }
      }
    });

    it('handles an empty collection', () => {
      expect([].sort(comparatorFor([]))).toEqual([]);
    });
  });

  describe('allPlainAscii', () => {
    it('is true only when every value is covered by the table', () => {
      expect(allPlainAscii(['a', 'b/c.js', ''])).toBe(true);
      expect(allPlainAscii([])).toBe(true);
      expect(allPlainAscii(['a', 'café'])).toBe(false);
      expect(allPlainAscii(['tab\there'])).toBe(false);
    });
  });

  describe('table integrity', () => {
    it('describes every printable ASCII code point', () => {
      for (const char of PRINTABLE) {
        expect(ASCII_COLLATION_WEIGHTS[char.charCodeAt(0)]).toBeGreaterThanOrEqual(0);
      }
    });

    it('gives each upper/lower case pair one weight, per sensitivity: base', () => {
      for (let code = 0x41; code <= 0x5a; code++) {
        expect(ASCII_COLLATION_WEIGHTS[code]).toBe(ASCII_COLLATION_WEIGHTS[code + 32]);
      }
    });

    it('gives every digit the same weight, since digit runs compare numerically', () => {
      const zero = ASCII_COLLATION_WEIGHTS[0x30];
      for (let code = 0x30; code <= 0x39; code++) {
        expect(ASCII_COLLATION_WEIGHTS[code]).toBe(zero);
      }
    });
  });

  describe('comparePlain', () => {
    it('matches a bare locale comparison, which is case-sensitive', () => {
      const plain = new Intl.Collator('en');
      for (const [a, b] of [
        ['.js', '.ts'],
        ['.JS', '.js'],
        ['.md', '.markdown'],
        ['', '.js'],
      ]) {
        expect(Math.sign(comparePlain(a, b))).toBe(Math.sign(plain.compare(a, b)));
      }
    });
  });
});
