import {
  WARNING_CODES,
  buildCancelledModel,
  buildNotices,
  buildCompletionModel,
  buildDryRunModel,
  buildEmptyModel,
  buildFailureModel,
  classifyWarnings,
} from '../../../../src/ui/feedback/model.js';
import { describeError } from '../../../../src/utils/errors.js';
import { ERROR_CODES, ValidationError } from '../../../../src/utils/errors.js';

const stats = { files: 47, outputBytes: 319488, estimatedTokens: 78000, durationMs: 840 };

describe('completion models', () => {
  it('names the result rather than the fact of finishing', () => {
    const model = buildCompletionModel({
      delivery: { actual: 'reference', path: '/tmp/proj-1.xml' },
      stats,
    });

    expect(model.status).toBe('success');
    expect(model.headline).toBe('File reference copied');
    expect(model.metrics).toEqual(['47 files', '~78k tokens']);
  });

  it.each([
    ['clipboard', {}, 'Output copied'],
    ['file', { path: '/home/greg/project/context.xml' }, 'Saved context.xml'],
    ['stream', {}, 'Stream complete'],
    ['stream', { path: '/tmp/context.xml' }, 'Streamed output to context.xml'],
  ])('describes the %s destination', (actual, extra, expected) => {
    const model = buildCompletionModel({ delivery: { actual, ...extra }, stats });
    expect(model.headline).toBe(expected);
  });

  // The display headline already carries the count; repeating it as a metric
  // produced "Displayed 47 files — 47 files".
  it('does not repeat the file count the display headline already states', () => {
    const model = buildCompletionModel({ delivery: { actual: 'display' }, stats });

    expect(model.headline).toBe('Displayed 47 files');
    expect(model.metrics).toEqual(['~78k tokens']);
  });

  it('adds size and duration only under verbose', () => {
    const plain = buildCompletionModel({ delivery: { actual: 'clipboard' }, stats });
    const verbose = buildCompletionModel({
      delivery: { actual: 'clipboard' },
      stats,
      verbose: true,
    });

    expect(plain.metrics).toEqual(['47 files', '~78k tokens']);
    expect(verbose.metrics).toEqual(['47 files', '312 KB', '~78k tokens', '840ms']);
  });

  it('handles a single file without a stray plural', () => {
    const model = buildCompletionModel({
      delivery: { actual: 'reference' },
      stats: { files: 1, estimatedTokens: 12 },
    });
    expect(model.metrics[0]).toBe('1 file');
  });

  // A usable but incomplete result says so in its headline, rather than a green
  // success line followed by a yellow one that reads as unrelated.
  it('qualifies the headline when the result was changed by a limit', () => {
    const warnings = [{ code: WARNING_CODES.FILES_OMITTED, message: '12 files omitted', data: {} }];
    const model = buildCompletionModel({ delivery: { actual: 'reference' }, stats, warnings });

    expect(model.status).toBe('warning');
    expect(model.headline).toBe('File reference copied with limits');
    expect(model.warnings).toHaveLength(1);
  });

  // A successful redaction is the guard working, and the detector is tuned to
  // over-match — repainting the run yellow for it puts a hazard sign on the
  // routine case and teaches the reader to stop reading yellow.
  it('reports a successful redaction as a calm note, not a warning', () => {
    const result = { stats: { secretsGuard: { redacted: 3, redactedPaths: ['src/config.js'] } } };
    const notices = buildNotices(result);

    expect(classifyWarnings(result)).toEqual([]);
    expect(notices).toEqual(['3 possible secrets redacted in config.js']);

    const model = buildCompletionModel({ delivery: { actual: 'reference' }, stats, notices });
    expect(model.status).toBe('success');
    expect(model.headline).toBe('File reference copied');
    expect(model.notes).toEqual(notices);
  });

  // A finding that could NOT be redacted is the opposite: the credential is
  // still in the output.
  it('warns when a finding could not be redacted', () => {
    const result = { stats: { secretsGuard: { findings: 4, redacted: 1 } } };
    const warnings = classifyWarnings(result);

    expect(warnings[0].code).toBe(WARNING_CODES.SECRETS_REDACTED);
    expect(warnings[0].message).toContain('3 possible secrets could not be redacted');

    const model = buildCompletionModel({ delivery: { actual: 'reference' }, stats, warnings });
    expect(model.headline).toBe('File reference copied with secrets still present');
  });

  it('reports a clipboard fallback as one outcome, not three lines', () => {
    const warnings = [
      {
        code: WARNING_CODES.CLIPBOARD_FALLBACK,
        message: 'Clipboard unavailable — output saved to /tmp/proj.xml',
        data: { path: '/tmp/proj.xml' },
      },
    ];
    const model = buildCompletionModel({
      delivery: { requested: 'clipboard', actual: 'file', path: '/tmp/proj.xml' },
      stats,
      warnings,
    });

    expect(model.status).toBe('warning');
    expect(model.headline).toBe('Clipboard unavailable — output saved to /tmp/proj.xml');
    expect(model.warnings).toHaveLength(0);
  });

  it('reports a preview as neutral, not success', () => {
    const model = buildDryRunModel({ stats });

    expect(model.status).toBe('neutral');
    expect(model.headline).toBe('Preview');
    expect(model.notes).toContain('No content was read and no output was written');
  });

  it('treats an empty selection as a valid outcome', () => {
    const model = buildEmptyModel();

    expect(model.status).toBe('neutral');
    expect(model.headline).toBe('No files matched');
  });

  it('reports cancellation without an error status', () => {
    expect(buildCancelledModel()).toMatchObject({ status: 'neutral', headline: 'Cancelled' });
  });

  it('builds a failure model with a remediation', () => {
    const error = new ValidationError('Invalid --size-gate value', 'size-gate', 'large', {
      code: ERROR_CODES.INVALID_OPTION,
      suggestion: 'Use a value such as 256KB, 10MB or 1GB',
    });
    const model = buildFailureModel(describeError(error));

    expect(model.status).toBe('error');
    expect(model.headline).toBe('Invalid --size-gate value');
    expect(model.notes).toEqual(['Use a value such as 256KB, 10MB or 1GB']);
  });
});

describe('warning classification', () => {
  const withReasons = (byReason, extra = {}) => ({ stats: { excluded: { byReason }, ...extra } });

  // The whole point of the classification: normal filtering is the tool
  // working, and turning a run yellow for it teaches people to ignore yellow.
  it('stays silent about routine exclusions', () => {
    const warnings = classifyWarnings(
      withReasons({ gitignore: 4102, configExclude: 602, filterPattern: 188, testExclude: 40 }),
    );

    expect(warnings).toEqual([]);
  });

  it('warns when a budget dropped files', () => {
    const warnings = classifyWarnings(withReasons({ totalSizeBudget: 12, gitignore: 4000 }));

    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(WARNING_CODES.FILES_OMITTED);
    expect(warnings[0].message).toContain('12 files omitted');
  });

  // `charBudget` counts files dropped whole; `truncatedFiles` counts the ones
  // that were shortened. Reading only the first missed a lone partially
  // truncated file entirely, and called the files it did count "shortened".
  it('separates shortened content from omitted files', () => {
    const shortened = classifyWarnings({
      stats: { truncatedFiles: 2, excluded: { byReason: {} } },
    });
    expect(shortened[0].code).toBe(WARNING_CODES.CONTENT_TRUNCATED);
    expect(shortened[0].message).toContain('shortened');

    const dropped = classifyWarnings(withReasons({ charBudget: 3 }));
    expect(dropped[0].code).toBe(WARNING_CODES.FILES_OMITTED);
    expect(dropped[0].message).toContain('omitted once the character limit');
  });

  it('warns about unreadable files', () => {
    const warnings = classifyWarnings(withReasons({ unreadable: 3 }));

    expect(warnings.map((w) => w.code)).toEqual([WARNING_CODES.FILES_UNREADABLE]);
  });

  // Dropping `.env` is the policy working and nearly every repository has one;
  // a file too large or too binary to scan is a real gap. Folding them together
  // made almost every run come back yellow.
  it('separates a deliberate secret-file exclusion from a file it could not scan', () => {
    const result = withReasons(
      {},
      {
        secretsGuard: {
          excludedSecretFiles: 1,
          excludedSecretFilePaths: ['config/.env'],
          excludedUnscannable: 2,
          excludedUnscannablePaths: ['big.bin', 'huge.pdf'],
        },
      },
    );

    const warnings = classifyWarnings(result);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(WARNING_CODES.SECRETS_UNSCANNABLE);
    expect(warnings[0].message).toContain('big.bin and huge.pdf');

    expect(buildNotices(result)).toEqual(['1 secret-prone file left out: .env']);
  });

  // "1 secret-prone file left out" says something happened without saying
  // whether it mattered; naming the file ends the question.
  it('names the files it is talking about, and caps the list', () => {
    const notices = buildNotices({
      stats: {
        secretsGuard: {
          excludedSecretFiles: 6,
          excludedSecretFilePaths: ['a/.env', 'b/id_rsa', 'c/x.pem', 'd/y.key'],
        },
      },
    });

    expect(notices[0]).toBe('6 secret-prone files left out: .env, id_rsa, x.pem and 3 more');
  });

  it('warns about a clipboard fallback', () => {
    const warnings = classifyWarnings(withReasons({}), {
      delivery: { fallbackUsed: true, path: '/tmp/x.xml', cause: 'no clipboard' },
    });

    expect(warnings[0].code).toBe(WARNING_CODES.CLIPBOARD_FALLBACK);
  });

  it('reads the live exclusion report in preference to the discovery snapshot', () => {
    const result = {
      exclusionReport: { toJSON: () => ({ byReason: { totalSizeBudget: 7 } }) },
      stats: { excluded: { byReason: {} } },
    };

    expect(classifyWarnings(result)[0].message).toContain('7 files omitted');
  });
});
