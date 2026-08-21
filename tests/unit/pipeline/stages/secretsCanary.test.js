/**
 * Canary tests for the secrets guard.
 *
 * Every assertion here is about the *absence of the original secret*, never
 * about a redaction counter. A counter reports what the guard believes it did;
 * a canary reports what actually reached the output. The two used to disagree
 * in two ways — `redactInline: false` emitted the file unchanged, and a finding
 * the redactor could not locate was skipped while the file went out labelled
 * `redacted` — and neither was visible from the counters.
 */

import SecretsGuardStage from '../../../../src/pipeline/stages/SecretsGuardStage.js';
import GitleaksAdapter from '../../../../src/services/GitleaksAdapter.js';
import SecretRedactor from '../../../../src/utils/SecretRedactor.js';
import { ExclusionReport, EXCLUSION_REASONS } from '../../../../src/utils/exclusionReport.js';
import { SecretsDetectedError } from '../../../../src/utils/errors.js';
import { jest } from '@jest/globals';

jest.mock('../../../../src/services/GitleaksAdapter.js');
jest.mock('../../../../src/config/ConfigManager.js', () => ({
  config: () => ({
    get: jest.fn((_key, defaultValue) => defaultValue),
  }),
}));

/**
 * A token with the shape the built-in scanner recognises. Every test asserts
 * this exact string is absent from whatever the guard emits.
 */
const CANARY = 'AKIAIOSFODNN7EXAMPLE';
const CANARY_LINE = `aws_access_key_id=${CANARY}`;

const buildInput = (content, path = 'creds.txt') => ({
  files: [{ path, relativePath: path, content, size: Buffer.byteLength(content) }],
  stats: {},
  exclusionReport: new ExclusionReport({ retention: 'all' }),
});

/** Every string the stage's output could carry the canary in. */
const surfacesOf = (result) =>
  [
    ...(result.files || []).map((f) => (typeof f?.content === 'string' ? f.content : '')),
    JSON.stringify(result.stats ?? {}),
    JSON.stringify(result.findings ?? []),
    JSON.stringify(result.exclusionReport?.toJSON?.() ?? {}),
  ].join(' ');

describe('secrets guard canaries', () => {
  let mockGitleaks;

  beforeEach(() => {
    mockGitleaks = {
      isAvailable: jest.fn().mockResolvedValue(false),
      getVersion: jest.fn().mockResolvedValue(null),
      scanString: jest.fn().mockResolvedValue([]),
    };
    GitleaksAdapter.mockImplementation(() => mockGitleaks);
  });

  afterEach(() => jest.clearAllMocks());

  test('the built-in scanner detects the canary at all (guards the fixture)', async () => {
    const stage = new SecretsGuardStage({ enabled: true });
    await stage.onInit();

    const result = await stage.process(buildInput(CANARY_LINE));

    expect(result.stats.secretsGuard.findings).toBeGreaterThan(0);
  });

  describe('redactInline: false', () => {
    test('excludes the whole file rather than emitting it unchanged', async () => {
      const stage = new SecretsGuardStage({ enabled: true, redactInline: false });
      await stage.onInit();

      const result = await stage.process(buildInput(CANARY_LINE));

      expect(result.files).toHaveLength(0);
      expect(result.stats.secretsGuard.excludedWithSecrets).toBe(1);
      expect(surfacesOf(result)).not.toContain(CANARY);
    });

    test('records the exclusion under a stable reason', async () => {
      const stage = new SecretsGuardStage({ enabled: true, redactInline: false });
      await stage.onInit();

      const result = await stage.process(buildInput(CANARY_LINE));
      const report = result.exclusionReport.toJSON();

      expect(report.byReason[EXCLUSION_REASONS.SECRET_DETECTED]).toBe(1);
    });

    test('leaves clean files alone', async () => {
      const stage = new SecretsGuardStage({ enabled: true, redactInline: false });
      await stage.onInit();

      const result = await stage.process(buildInput('const answer = 42;'));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('const answer = 42;');
    });

    test('failOnSecrets still wins over exclusion', async () => {
      const stage = new SecretsGuardStage({
        enabled: true,
        redactInline: false,
        failOnSecrets: true,
      });
      await stage.onInit();

      await expect(stage.process(buildInput(CANARY_LINE))).rejects.toBeInstanceOf(
        SecretsDetectedError,
      );
    });
  });

  describe('unredactable findings', () => {
    /** A finding whose coordinates point nowhere, with no match to relocate by. */
    const unmappable = [
      { RuleID: 'aws-key', StartLine: 999, EndLine: 999, StartColumn: 1, EndColumn: 20 },
    ];

    test('excludes the file instead of labelling it redacted', async () => {
      mockGitleaks.isAvailable.mockResolvedValue(true);
      mockGitleaks.scanString.mockResolvedValue(unmappable);

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput(CANARY_LINE));

      expect(result.files).toHaveLength(0);
      expect(result.stats.secretsGuard.redactionFailures).toBe(1);
      expect(surfacesOf(result)).not.toContain(CANARY);
    });

    test('reports the failure as a degradation so --strict can refuse it', async () => {
      mockGitleaks.isAvailable.mockResolvedValue(true);
      mockGitleaks.scanString.mockResolvedValue(unmappable);

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput(CANARY_LINE));

      expect(result.stats.degradations).toEqual([
        expect.objectContaining({ code: 'SECRET_REDACTION_FAILED' }),
      ]);
    });

    test('a residual the re-scan finds excludes the file', async () => {
      // The scanner locates the credential on line 1 and says nothing about the
      // identical copy on line 2. Redaction of the reported span succeeds, so
      // every coordinate-based check calls this file clean — and the re-scan is
      // what notices the copy is still there.
      const masked = '*'.repeat(CANARY.length);
      mockGitleaks.isAvailable.mockResolvedValue(true);
      mockGitleaks.scanString
        .mockResolvedValueOnce([
          {
            RuleID: 'aws-key',
            StartLine: 1,
            EndLine: 1,
            StartColumn: 19,
            EndColumn: 18 + CANARY.length,
            // Masked, exactly as gitleaks reports it under `--redact`.
            Match: masked,
          },
        ])
        // The re-scan of the redacted content: line 1 is now a marker, and the
        // copy on line 2 is what gitleaks reports this time.
        .mockResolvedValue([
          {
            RuleID: 'aws-key',
            StartLine: 2,
            EndLine: 2,
            StartColumn: 8,
            EndColumn: 7 + CANARY.length,
            Match: masked,
          },
        ]);

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput(`${CANARY_LINE}\nbackup=${CANARY}\n`));

      expect(result.files).toHaveLength(0);
      expect(result.stats.secretsGuard.redactionFailures).toBeGreaterThan(0);
      expect(surfacesOf(result)).not.toContain(CANARY);
    });

    test('a masked match is never used to relocate onto a decoy', async () => {
      // The file contains a literal mask — a documented example of a redacted
      // key — and a real credential. Gitleaks reports the real one, with its
      // `Match` masked. Trusting that masked value would find the decoy, redact
      // the example, and leave the credential while reporting success.
      const decoy = '*'.repeat(CANARY.length);
      const content = `example = "${decoy}"\nreal = ${CANARY}\n`;

      mockGitleaks.isAvailable.mockResolvedValue(true);
      mockGitleaks.scanString
        .mockResolvedValueOnce([
          {
            RuleID: 'aws-key',
            StartLine: 2,
            EndLine: 2,
            StartColumn: 8,
            EndColumn: 7 + CANARY.length,
            Match: decoy,
          },
        ])
        // The verification re-scan of the redacted content.
        .mockResolvedValue([]);

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput(content));

      expect(result.files).toHaveLength(1);
      expect(surfacesOf(result)).not.toContain(CANARY);
      // The decoy is not a secret and must survive untouched.
      expect(result.files[0].content).toContain(decoy);
    });

    test('a scanner switch during verification excludes the file', async () => {
      // Gitleaks finds a credential the built-in scanner has no pattern for,
      // then dies before it can confirm the redaction. The built-in scanner
      // taking over and reporting "clean" is a weaker tool overruling a
      // stronger one, not a verification.
      const masked = '*'.repeat(16);
      mockGitleaks.isAvailable.mockResolvedValue(true);
      mockGitleaks.scanString
        .mockResolvedValueOnce([
          {
            RuleID: 'vendor-token',
            StartLine: 1,
            EndLine: 1,
            StartColumn: 8,
            EndColumn: 23,
            Match: masked,
          },
        ])
        .mockRejectedValue(new Error('gitleaks timed out'));

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput('token= zzzzzzzzzzzzzzzz'));

      expect(result.files).toHaveLength(0);
      expect(result.stats.secretsGuard.excludedWithSecrets).toBe(1);
    });

    test('failOnSecrets fails the run when gitleaks cannot describe its detection', async () => {
      const failure = new Error('report unreadable');
      failure.detectedWithoutFindings = true;

      mockGitleaks.isAvailable.mockResolvedValue(true);
      mockGitleaks.scanString.mockRejectedValue(failure);

      const stage = new SecretsGuardStage({ enabled: true, failOnSecrets: true });
      await stage.onInit();

      await expect(stage.process(buildInput('opaque = "zzzzzzzzzzzzzzzz"'))).rejects.toBeInstanceOf(
        SecretsDetectedError,
      );
    });

    test('gitleaks detecting a secret it cannot describe excludes the file', async () => {
      // Exit code 1 with an unreadable report: gitleaks has positively said the
      // file contains a secret and only the list is missing. The built-in
      // scanner coming back clean is a weaker tool overruling a stronger one
      // after the fact.
      const failure = new Error('report unreadable');
      failure.detectedWithoutFindings = true;

      mockGitleaks.isAvailable.mockResolvedValue(true);
      mockGitleaks.scanString.mockRejectedValue(failure);

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      // Content the built-in scanner has no pattern for, so the fallback is clean.
      const result = await stage.process(buildInput('opaque = "zzzzzzzzzzzzzzzz"'));

      expect(result.files).toHaveLength(0);
      expect(result.stats.secretsGuard.excludedWithSecrets).toBe(1);
    });
  });

  describe('redaction that does succeed', () => {
    test('removes the canary and keeps the file', async () => {
      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput(CANARY_LINE));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].redacted).toBe(true);
      expect(surfacesOf(result)).not.toContain(CANARY);
    });

    test.each([
      ['LF', `${CANARY_LINE}\nsecond line\n`],
      ['CRLF', `${CANARY_LINE}\r\nsecond line\r\n`],
      ['leading unicode', `# 日本語 コメント\n${CANARY_LINE}\n`],
      ['no trailing newline', CANARY_LINE],
      ['canary at the very start', `${CANARY}\ntrailing\n`],
      ['canary at the very end', `leading\n${CANARY}`],
      ['indented', `    ${CANARY_LINE}\n`],
    ])('%s content never emits the canary', async (_label, content) => {
      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput(content));

      // Both halves matter. Absence of the canary alone would also be satisfied
      // by dropping every file, which is safe but is not what this claims.
      expect(result.files).toHaveLength(1);
      expect(result.files[0].redacted).toBe(true);
      expect(surfacesOf(result)).not.toContain(CANARY);
    });
  });

  describe('safe findings', () => {
    test('never carry the matched bytes into stats or events', async () => {
      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process(buildInput(CANARY_LINE));

      expect(JSON.stringify(result.findings)).not.toContain(CANARY);
      expect(JSON.stringify(result.stats.secretsGuard.report)).not.toContain(CANARY);
    });

    test('a thrown SecretsDetectedError carries no matched bytes', async () => {
      const stage = new SecretsGuardStage({ enabled: true, failOnSecrets: true });
      await stage.onInit();

      const error = await stage.process(buildInput(CANARY_LINE)).catch((e) => e);

      expect(error).toBeInstanceOf(SecretsDetectedError);
      expect(JSON.stringify({ m: error.message, f: error.findings })).not.toContain(CANARY);
    });
  });
});

describe('SecretRedactor coverage contract', () => {
  test('reports covered when every span is replaced', () => {
    const content = `key=${CANARY}`;
    const result = SecretRedactor.redact(
      content,
      [
        {
          RuleID: 'canary',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 5,
          EndColumn: 4 + CANARY.length,
          Match: CANARY,
        },
      ],
      'typed',
    );

    expect(result.covered).toBe(true);
    expect(result.content).not.toContain(CANARY);
    expect(result.failed).toEqual([]);
  });

  test('reports the failure when coordinates resolve nowhere', () => {
    const result = SecretRedactor.redact('short', [
      { RuleID: 'canary', StartLine: 40, EndLine: 40, StartColumn: 1, EndColumn: 8 },
    ]);

    expect(result.covered).toBe(false);
    expect(result.failed[0].reason).toBe('unmappable');
  });

  test('covers a finding whose columns drifted, when the match is raw', () => {
    const content = `key=${CANARY}\n`;
    const result = SecretRedactor.redact(
      content,
      [
        // Columns describe `ey=AKIAI` — a span that overlaps the credential but
        // starts and ends in the wrong place.
        {
          RuleID: 'canary',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 2,
          EndColumn: 9,
          Match: CANARY,
        },
      ],
      'typed',
      { rawMatch: true },
    );

    expect(result.covered).toBe(true);
    expect(result.content).not.toContain(CANARY);
    // Both candidate spans are covered, so nothing of the credential survives
    // and the drifted coordinates did not have to be trusted.
    expect(result.applied).toHaveLength(1);
  });

  test('a drifted finding is NOT silently covered when the match is masked', () => {
    const content = `key=${CANARY}\n`;
    const result = SecretRedactor.redact(
      content,
      [
        {
          RuleID: 'canary',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 2,
          EndColumn: 9,
          Match: '*'.repeat(CANARY.length),
        },
      ],
      'typed',
    );

    // The coordinate span is all there is, so part of the credential survives.
    // Nothing here claims otherwise; the stage's verification re-scan is what
    // catches it.
    expect(result.content).toContain('XAMPLE');
  });

  test('does not redact every occurrence of a very short match', () => {
    const content = 'aa aa aa aa';
    const result = SecretRedactor.redact(
      content,
      [{ RuleID: 'short', StartLine: 1, EndLine: 1, StartColumn: 1, EndColumn: 2, Match: 'aa' }],
      'typed',
      { rawMatch: true },
    );

    // Only the reported span. Expanding a two-character match to every
    // occurrence would merge the touching ranges and swallow the line.
    expect(result.applied).toHaveLength(1);
    expect(result.content).toBe('***REDACTED:SHORT*** aa aa aa');
  });

  test.each([
    ['no columns at all', { RuleID: 'x', StartLine: 1 }],
    ['a zero column', { RuleID: 'x', StartLine: 1, EndLine: 1, StartColumn: 0, EndColumn: 4 }],
    [
      'a line past the end',
      { RuleID: 'x', StartLine: 9, EndLine: 9, StartColumn: 1, EndColumn: 4 },
    ],
    [
      'a reversed range on one line',
      { RuleID: 'x', StartLine: 1, EndLine: 1, StartColumn: 8, EndColumn: 2 },
    ],
    [
      'a column past the line',
      { RuleID: 'x', StartLine: 1, EndLine: 1, StartColumn: 1, EndColumn: 400 },
    ],
  ])('residualFindings keeps a finding with %s as residue', (_label, finding) => {
    const redacted = '***REDACTED:X***\ntail';
    const markers = [{ start: 0, end: 16 }];

    expect(SecretRedactor.residualFindings(redacted, [finding], markers)).toHaveLength(1);
  });

  test('merges overlapping findings into one replacement', () => {
    const content = `key=${CANARY}`;
    const result = SecretRedactor.redact(
      content,
      [
        {
          RuleID: 'a',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 5,
          EndColumn: 4 + CANARY.length,
          Match: CANARY,
        },
        {
          RuleID: 'b',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 5,
          EndColumn: 14,
          Match: CANARY.slice(0, 10),
        },
      ],
      'typed',
    );

    expect(result.applied).toHaveLength(1);
    expect(result.covered).toBe(true);
    expect(result.content).not.toContain(CANARY);
  });

  test('handles duplicate findings without double-replacing', () => {
    const content = `key=${CANARY}`;
    const finding = {
      RuleID: 'canary',
      StartLine: 1,
      EndLine: 1,
      StartColumn: 5,
      EndColumn: 4 + CANARY.length,
      Match: CANARY,
    };
    const result = SecretRedactor.redact(content, [finding, { ...finding }], 'typed');

    expect(result.applied).toHaveLength(1);
    expect(result.content).toBe('key=***REDACTED:CANARY***');
  });

  test('redacts a multiline block whose end column precedes its start', () => {
    const content = [
      'const key = `-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA',
      '-----END RSA PRIVATE KEY-----`;',
    ].join('\n');

    const result = SecretRedactor.redact(
      content,
      [{ RuleID: 'private-key', StartLine: 1, EndLine: 3, StartColumn: 13, EndColumn: 30 }],
      'typed',
    );

    expect(result.covered).toBe(true);
    expect(result.content).not.toContain('MIIEowIBAAKCAQEA');
    expect(result.content.endsWith(';')).toBe(true);
  });

  test('fails closed on non-text content rather than passing it through', () => {
    const result = SecretRedactor.redact(Buffer.from('x'), [{ RuleID: 'a', StartLine: 1 }]);

    expect(result.covered).toBe(false);
    expect(result.failed[0].reason).toBe('non-text-content');
  });

  test('a single-character match is replaced', () => {
    const result = SecretRedactor.redact(
      'a=X',
      [{ RuleID: 'one', StartLine: 1, EndLine: 1, StartColumn: 3, EndColumn: 3, Match: 'X' }],
      'generic',
    );

    expect(result.covered).toBe(true);
    expect(result.content).toBe('a=***REDACTED***');
  });

  test('a gitleaks finding without a RuleID keeps its capitalised coordinates', () => {
    // Read as a built-in finding, the lower-cased lookups all miss, the span
    // collapses to the first character of the file, and the credential is left
    // in place while the redaction counts as applied.
    const content = `key=${CANARY}`;
    const result = SecretRedactor.redact(
      content,
      [{ StartLine: 1, EndLine: 1, StartColumn: 5, EndColumn: 4 + CANARY.length }],
      'typed',
    );

    expect(result.covered).toBe(true);
    expect(result.content).toBe('key=***REDACTED:UNKNOWN***');
  });

  test('covers every occurrence when the match is known to be raw', () => {
    const content = `a=${CANARY}\nb=${CANARY}\n`;
    const result = SecretRedactor.redact(
      content,
      [
        {
          RuleID: 'canary',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 3,
          EndColumn: 2 + CANARY.length,
          Match: CANARY,
        },
      ],
      'typed',
      { rawMatch: true },
    );

    expect(result.applied).toHaveLength(2);
    expect(result.covered).toBe(true);
    expect(result.content).not.toContain(CANARY);
  });

  test('a masked match is ignored entirely when rawMatch is not set', () => {
    const decoy = '*'.repeat(CANARY.length);
    const content = `doc="${decoy}"\nreal=${CANARY}`;
    const result = SecretRedactor.redact(
      content,
      [
        {
          RuleID: 'canary',
          StartLine: 2,
          EndLine: 2,
          StartColumn: 6,
          EndColumn: 5 + CANARY.length,
          Match: decoy,
        },
      ],
      'typed',
    );

    expect(result.content).not.toContain(CANARY);
    expect(result.content).toContain(decoy);
  });

  test('merges spans that exactly touch', () => {
    const content = 'AABB';
    const result = SecretRedactor.redact(
      content,
      [
        { RuleID: 'a', StartLine: 1, EndLine: 1, StartColumn: 1, EndColumn: 2 },
        { RuleID: 'b', StartLine: 1, EndLine: 1, StartColumn: 3, EndColumn: 4 },
      ],
      'typed',
    );

    expect(result.applied).toHaveLength(1);
    expect(result.content).toBe('***REDACTED:A+B***');
  });

  test('marker positions describe the redacted content, not the original', () => {
    const content = `key=${CANARY}`;
    const result = SecretRedactor.redact(
      content,
      [
        {
          RuleID: 'canary',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 5,
          EndColumn: 4 + CANARY.length,
        },
      ],
      'typed',
    );

    const [marker] = result.markers;
    expect(result.content.slice(marker.start, marker.end)).toBe('***REDACTED:CANARY***');
  });

  test('residualFindings treats a re-scan hit inside a marker as the marker', () => {
    const redacted = 'password=***REDACTED:PASSWORD***';
    const markers = [{ start: 9, end: redacted.length }];
    const finding = {
      RuleID: 'password',
      StartLine: 1,
      EndLine: 1,
      StartColumn: 10,
      EndColumn: redacted.length,
    };

    expect(SecretRedactor.residualFindings(redacted, [finding], markers)).toEqual([]);
  });

  test('residualFindings reports a re-scan hit outside every marker', () => {
    const redacted = `a=***REDACTED:X***\nb=${CANARY}`;
    const markers = [{ start: 2, end: 18 }];
    const finding = {
      RuleID: 'canary',
      StartLine: 2,
      EndLine: 2,
      StartColumn: 3,
      EndColumn: 2 + CANARY.length,
    };

    expect(SecretRedactor.residualFindings(redacted, [finding], markers)).toHaveLength(1);
  });

  test('an empty finding list is trivially covered', () => {
    expect(SecretRedactor.redact('anything', [])).toEqual({
      content: 'anything',
      count: 0,
      applied: [],
      markers: [],
      failed: [],
      covered: true,
    });
  });
});
