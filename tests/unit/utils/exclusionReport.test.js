import {
  ExclusionReport,
  EXCLUSION_REASONS,
  reasonForLayerKind,
} from '../../../src/utils/exclusionReport.js';

describe('ExclusionReport', () => {
  it('starts empty with every reason initialized to zero', () => {
    const report = new ExclusionReport();

    expect(report.isEmpty).toBe(true);
    expect(report.total).toBe(0);
    for (const reason of Object.values(EXCLUSION_REASONS)) {
      expect(report.byReason[reason]).toBe(0);
    }
  });

  it('counts exclusions by reason', () => {
    const report = new ExclusionReport();

    report.add({ path: 'a.png', size: 10, reason: EXCLUSION_REASONS.CONFIG_EXCLUDE });
    report.add({ path: 'b.png', size: 20, reason: EXCLUSION_REASONS.CONFIG_EXCLUDE });
    report.add({ path: 'c.txt', size: 30, reason: EXCLUSION_REASONS.GITIGNORE });

    const json = report.toJSON();
    expect(json.total).toBe(3);
    expect(json.byReason[EXCLUSION_REASONS.CONFIG_EXCLUDE]).toBe(2);
    expect(json.byReason[EXCLUSION_REASONS.GITIGNORE]).toBe(1);
  });

  it('ignores entries with no reason', () => {
    const report = new ExclusionReport();

    report.add(null);
    report.add({ path: 'a.txt', size: 1 });

    expect(report.total).toBe(0);
  });

  it('omits per-file detail unless explain is enabled', () => {
    const report = new ExclusionReport();
    report.add({ path: 'a.png', size: 10, reason: EXCLUSION_REASONS.SIZE_GATE });

    expect(report.toJSON().largest).toBeUndefined();
  });

  it('retains the largest exclusions under explain', () => {
    const report = new ExclusionReport({ explain: true, topN: 2 });

    report.add({ path: 'small', size: 1, reason: EXCLUSION_REASONS.SIZE_GATE });
    report.add({ path: 'huge', size: 1000, reason: EXCLUSION_REASONS.SIZE_GATE });
    report.add({ path: 'medium', size: 100, reason: EXCLUSION_REASONS.SIZE_GATE });

    const { largest } = report.toJSON();
    expect(largest.map((e) => e.path)).toEqual(['huge', 'medium']);
  });

  it('keeps the rule and its source when supplied', () => {
    const report = new ExclusionReport({ explain: true });

    report.add({
      path: 'build/out.js',
      size: 42,
      reason: EXCLUSION_REASONS.GITIGNORE,
      rule: 'build/',
      ruleSource: '/repo/.gitignore:3',
    });

    expect(report.toJSON().largest[0]).toEqual({
      path: 'build/out.js',
      size: 42,
      reason: EXCLUSION_REASONS.GITIGNORE,
      rule: 'build/',
      ruleSource: '/repo/.gitignore:3',
    });
  });

  it('bounds memory when far more exclusions arrive than topN', () => {
    const report = new ExclusionReport({ explain: true, topN: 5 });

    for (let i = 0; i < 500; i++) {
      report.add({ path: `f${i}`, size: i, reason: EXCLUSION_REASONS.GITIGNORE });
    }

    // Counts stay exact even though detail is trimmed
    expect(report.total).toBe(500);
    expect(report._details.length).toBeLessThanOrEqual(5 * 8);
    expect(report.toJSON().largest).toHaveLength(5);
    expect(report.toJSON().largest[0].path).toBe('f499');
  });

  it('merges another report', () => {
    const a = new ExclusionReport({ explain: true });
    const b = new ExclusionReport({ explain: true });

    a.add({ path: 'a', size: 1, reason: EXCLUSION_REASONS.GITIGNORE });
    b.add({ path: 'b', size: 2, reason: EXCLUSION_REASONS.GITIGNORE });
    b.add({ path: 'c', size: 3, reason: EXCLUSION_REASONS.SIZE_GATE });

    a.merge(b);

    expect(a.total).toBe(3);
    expect(a.byReason[EXCLUSION_REASONS.GITIGNORE]).toBe(2);
    expect(a.byReason[EXCLUSION_REASONS.SIZE_GATE]).toBe(1);
    expect(a.toJSON().largest.map((e) => e.path)).toEqual(['c', 'b', 'a']);
  });

  it('merge tolerates a null report', () => {
    const report = new ExclusionReport();
    expect(() => report.merge(null)).not.toThrow();
  });
});

describe('reasonForLayerKind', () => {
  it.each([
    ['gitignore', EXCLUSION_REASONS.GITIGNORE],
    ['copytreeignore', EXCLUSION_REASONS.COPYTREEIGNORE],
    ['global-gitignore', EXCLUSION_REASONS.GLOBAL_GITIGNORE],
    ['git-info-exclude', EXCLUSION_REASONS.GIT_INFO_EXCLUDE],
    ['option-exclude', EXCLUSION_REASONS.OPTION_EXCLUDE],
    ['test-exclude', EXCLUSION_REASONS.TEST_EXCLUDE],
    ['config-exclude', EXCLUSION_REASONS.CONFIG_EXCLUDE],
  ])('maps layer kind %s to %s', (kind, reason) => {
    expect(reasonForLayerKind(kind)).toBe(reason);
  });

  it('falls back to configExclude for an unknown kind', () => {
    expect(reasonForLayerKind(undefined)).toBe(EXCLUSION_REASONS.CONFIG_EXCLUDE);
  });
});

describe('EXCLUSION_REASONS', () => {
  it('exposes stable machine-readable keys, not prose', () => {
    // These values cross process boundaries and get rendered by switch
    // statements, so they must stay stable and free of spaces/punctuation.
    for (const value of Object.values(EXCLUSION_REASONS)) {
      expect(value).toMatch(/^[a-z][A-Za-z]*$/);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(EXCLUSION_REASONS)).toBe(true);
  });
});
