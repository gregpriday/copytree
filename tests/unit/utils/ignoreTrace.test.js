/**
 * The pieces `explain` and the highest-precedence exclusion layers rest on.
 *
 * `testPath` answers "is it ignored"; `tracePath` answers "why", which is a
 * larger question — a path can be excluded by a root rule, restored by a
 * negation two directories down, and excluded again by `--exclude`, and only
 * the whole sequence explains the outcome.
 */

import path from 'path';
import ignore from 'ignore';
import fs from 'fs-extra';
import { withTempDir } from '../../helpers/tempfs.js';
import { getAllFiles, testPath, tracePath } from '../../../src/utils/ignoreWalker.js';
import { ExclusionReport, EXCLUSION_REASONS } from '../../../src/utils/exclusionReport.js';

jest.unmock('../../../src/utils/fsx.js');

/**
 * Build an ignore layer the way the discovery stage does.
 * @param {string} base - Layer base directory
 * @param {string[]} rules - Ignore rules
 * @param {string} kind - Layer kind
 * @param {string} source - Layer source label
 * @returns {Object} Layer
 */
function layer(base, rules, kind, source) {
  return { base, ig: ignore().add(rules), kind, source, rules };
}

describe('tracePath', () => {
  it('reports every matching layer in evaluation order', async () => {
    await withTempDir('trace-order', async (dir) => {
      await fs.outputFile(path.join(dir, '.gitignore'), 'build/\n');
      await fs.outputFile(path.join(dir, 'build/keep.txt'), 'keep');

      const trace = await tracePath('build/keep.txt', dir, {
        ignoreFileNames: ['.gitignore', '.copytreeignore'],
      });

      expect(trace.ignored).toBe(true);
      expect(trace.steps).toHaveLength(1);
      expect(trace.steps[0].kind).toBe('gitignore');
      expect(trace.steps[0].line).toBe(1);
      expect(trace.steps[0].verdict).toBe('exclude');
      expect(trace.steps[0].source).toContain('.gitignore');
    });
  });

  it('shows a negation reversing an earlier exclusion', async () => {
    await withTempDir('trace-negation', async (dir) => {
      await fs.outputFile(path.join(dir, '.gitignore'), '*.log\n!keep.log\n');
      await fs.outputFile(path.join(dir, 'keep.log'), 'keep');

      const trace = await tracePath('keep.log', dir, {
        ignoreFileNames: ['.gitignore', '.copytreeignore'],
      });

      expect(trace.ignored).toBe(false);
      // Both rules in the file had something to say about this path, and both
      // are shown: the net verdict alone hides half the story.
      expect(trace.steps.map((step) => step.verdict)).toEqual(['exclude', 'include']);
      expect(trace.steps.map((step) => step.rule)).toEqual(['*.log', '!keep.log']);
      expect(trace.steps[1].line).toBe(2);
    });
  });

  it('gives the final layers the last word over a nested negation', async () => {
    await withTempDir('trace-final-layer', async (dir) => {
      await fs.outputFile(path.join(dir, 'docs/.copytreeignore'), '!keep.md\n');
      await fs.outputFile(path.join(dir, 'docs/keep.md'), '# keep');

      const trace = await tracePath('docs/keep.md', dir, {
        ignoreFileNames: ['.gitignore', '.copytreeignore'],
        finalLayers: [layer(dir, ['docs/'], 'option-exclude', 'option:--exclude')],
      });

      expect(trace.ignored).toBe(true);
      expect(trace.steps.at(-1).kind).toBe('option-exclude');
      expect(trace.steps.at(-1).reason).toBe(EXCLUSION_REASONS.OPTION_EXCLUDE);
    });
  });

  it('reports the hard exclusion no rule can lift', async () => {
    await withTempDir('trace-hard', async (dir) => {
      await fs.outputFile(path.join(dir, '.git/config'), '[core]\n');

      const trace = await tracePath('.git/config', dir, {
        ignoreFileNames: ['.gitignore', '.copytreeignore'],
      });

      expect(trace.ignored).toBe(true);
      expect(trace.steps.at(-1).kind).toBe('hard-exclude');
    });
  });

  it('reports nothing for a path no rule touches', async () => {
    await withTempDir('trace-clean', async (dir) => {
      await fs.outputFile(path.join(dir, 'src/index.js'), 'export {};');

      const trace = await tracePath('src/index.js', dir, {
        ignoreFileNames: ['.gitignore', '.copytreeignore'],
      });

      expect(trace.ignored).toBe(false);
      expect(trace.steps).toEqual([]);
    });
  });

  it('agrees with testPath on the verdict', async () => {
    await withTempDir('trace-agreement', async (dir) => {
      await fs.outputFile(path.join(dir, '.copytreeignore'), 'docs/\n');
      await fs.outputFile(path.join(dir, 'docs/guide.md'), '# guide');

      const options = { ignoreFileNames: ['.gitignore', '.copytreeignore'] };
      const decision = await testPath('docs/guide.md', dir, options);
      const trace = await tracePath('docs/guide.md', dir, options);

      expect(trace.ignored).toBe(decision.ignored);
    });
  });
});

describe('walker final layers', () => {
  it('outrank a negation written inside the tree', async () => {
    await withTempDir('walk-final-layer', async (dir) => {
      await fs.outputFile(path.join(dir, 'docs/.copytreeignore'), '!keep.md\n');
      await fs.outputFile(path.join(dir, 'docs/keep.md'), '# keep');
      await fs.outputFile(path.join(dir, 'src/index.js'), 'export {};');

      const files = await getAllFiles(dir, {
        ignoreFileNames: ['.gitignore', '.copytreeignore'],
        finalLayers: [layer(dir, ['docs/'], 'option-exclude', 'option:--exclude')],
      });

      const relative = files.map((file) => path.relative(dir, file.path));
      expect(relative).toEqual(['src/index.js']);
    });
  });

  it('are not inherited more than once as traversal descends', async () => {
    await withTempDir('walk-final-depth', async (dir) => {
      await fs.outputFile(path.join(dir, 'a/b/c/deep.js'), 'export {};');
      await fs.outputFile(path.join(dir, 'a/b/c/skip.log'), 'noise');

      const files = await getAllFiles(dir, {
        ignoreFileNames: ['.gitignore', '.copytreeignore'],
        finalLayers: [layer(dir, ['*.log'], 'option-exclude', 'option:--exclude')],
      });

      expect(files.map((file) => path.relative(dir, file.path))).toEqual(['a/b/c/deep.js']);
    });
  });
});

describe('ExclusionReport retention', () => {
  it('keeps counts only by default', () => {
    const report = new ExclusionReport();
    report.add({ path: 'a.txt', size: 10, reason: EXCLUSION_REASONS.GITIGNORE });

    expect(report.total).toBe(1);
    expect(report.entries()).toEqual([]);
    expect(report.toJSON().largest).toBeUndefined();
  });

  it('keeps the largest entries under `top`', () => {
    const report = new ExclusionReport({ retention: 'top', topN: 2 });
    for (let index = 0; index < 30; index += 1) {
      report.add({ path: `f${index}.txt`, size: index, reason: EXCLUSION_REASONS.GITIGNORE });
    }

    const json = report.toJSON();
    expect(json.total).toBe(30);
    expect(json.largest).toHaveLength(2);
    expect(json.largest[0].size).toBeGreaterThan(json.largest[1].size);
  });

  it('keeps every decision under `all`, in the order they were made', () => {
    const report = new ExclusionReport({ retention: 'all' });
    report.add({ path: 'b.txt', size: 1, reason: EXCLUSION_REASONS.GITIGNORE });
    report.add({ path: 'a.txt', size: 99, reason: EXCLUSION_REASONS.OPTION_EXCLUDE });

    expect(report.entries().map((entry) => entry.path)).toEqual(['b.txt', 'a.txt']);
    // The largest are still summarised, without discarding the rest.
    expect(report.toJSON().largest[0].path).toBe('a.txt');
    expect(report.toJSON().retained).toBe(2);
  });

  it('counts what the entry ceiling dropped rather than truncating silently', () => {
    const report = new ExclusionReport({ retention: 'all', maxEntries: 2 });
    for (const name of ['a', 'b', 'c', 'd']) {
      report.add({ path: `${name}.txt`, size: 1, reason: EXCLUSION_REASONS.GITIGNORE });
    }

    const json = report.toJSON();
    expect(json.total).toBe(4);
    expect(report.entries()).toHaveLength(2);
    expect(json.truncated).toBe(true);
    expect(json.omittedEntries).toBe(2);
  });

  it('records directory decisions distinguishably', () => {
    const report = new ExclusionReport({ retention: 'all' });
    report.add({
      path: 'docs',
      size: 0,
      reason: EXCLUSION_REASONS.OPTION_EXCLUDE,
      isDirectory: true,
    });

    expect(report.entries()[0].isDirectory).toBe(true);
  });
});
