import { Reporter } from '../../../../src/ui/feedback/Reporter.js';
import { PHASES } from '../../../../src/ui/feedback/messages.js';
import { buildCompletionModel } from '../../../../src/ui/feedback/model.js';

/**
 * A stream that records what was written, and can pretend to be a terminal.
 * Reporter behaviour is entirely a function of what the stream claims to be,
 * so every mode is testable without a PTY.
 */
function fakeStream({ isTTY = false, columns = 80 } = {}) {
  const chunks = [];
  return {
    isTTY,
    columns,
    chunks,
    write: (chunk) => chunks.push(chunk),
    get text() {
      return chunks.join('');
    },
  };
}

const env = { LANG: 'en_US.UTF-8' };
const stats = { files: 47, estimatedTokens: 78000 };
const model = buildCompletionModel({ delivery: { actual: 'reference' }, stats });

describe('Reporter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes exactly one line for a run that finishes quickly', () => {
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env, color: 'never' });

    reporter.start();
    reporter.phase(PHASES.DISCOVER);
    reporter.complete(model);
    reporter.close();

    // A success line has nothing to warn about, so its leading position names
    // the destination instead of restating that it worked.
    const lines = stream.text.split('\n').filter((line) => line.trim() !== '');
    expect(lines).toEqual(['📎 File reference copied — 47 files · ~78k tokens']);
  });

  // A spinner that appears for a fraction of a second makes a fast command feel
  // slower than one that prints nothing until it is done.
  it('does not start a spinner before the delay elapses', () => {
    jest.useFakeTimers();
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env, color: 'never' });

    reporter.start();
    reporter.phase(PHASES.LOAD);
    jest.advanceTimersByTime(100);
    expect(stream.text).toBe('');

    jest.advanceTimersByTime(60);
    expect(stream.text).toContain('Reading files');

    reporter.close();
  });

  it('never animates on a stream that is not a terminal', () => {
    jest.useFakeTimers();
    const stream = fakeStream({ isTTY: false });
    const reporter = new Reporter({ stream, env });

    reporter.start();
    reporter.phase(PHASES.LOAD);
    jest.advanceTimersByTime(5000);

    expect(stream.text).toBe('');
    reporter.close();
  });

  it('falls back to ASCII when the stream cannot render Unicode', () => {
    const stream = fakeStream({ isTTY: false });
    const reporter = new Reporter({ stream, env, color: 'never' });

    reporter.complete(model);

    expect(stream.text.trim()).toBe('[ok] File reference copied — 47 files · ~78k tokens');
  });

  it('emits no ANSI when colour is disabled', () => {
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env, color: 'never' });

    reporter.complete(model);

    // eslint-disable-next-line no-control-regex
    expect(stream.text).not.toMatch(/\x1b\[[0-9;]*m/);
  });

  it('colours the status when the stream takes colour', () => {
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env, color: 'always' });

    reporter.complete(model);

    expect(stream.text).toContain('\x1b[32m');
  });

  // Quiet is for scripts: a successful run says nothing, a failure still does.
  it('says nothing on success when quiet, but still reports failure', () => {
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env, quiet: true, color: 'never' });

    reporter.phase(PHASES.LOAD);
    reporter.note('something happened');
    reporter.complete(model);
    expect(stream.text).toBe('');

    reporter.fail({ status: 'error', headline: 'Path not found', notes: ['Check the path'] });
    expect(stream.text).toContain('Path not found');
  });

  it('emits one JSON object per line and no ANSI or emoji', () => {
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env, format: 'json', color: 'always' });

    reporter.start({ target: '/project', format: 'xml' });
    reporter.phase(PHASES.LOAD, { completed: 10, total: 20 });
    reporter.complete(model);
    reporter.close();

    const lines = stream.text.trim().split('\n');
    const events = lines.map((line) => JSON.parse(line));
    expect(events.map((e) => e.event)).toEqual(['run.start', 'phase.change', 'run.complete']);
    expect(events[2].headline).toBe('File reference copied');
    // eslint-disable-next-line no-control-regex
    expect(stream.text).not.toMatch(/\x1b/);
  });

  it('renders phase counts rather than a percentage', () => {
    const stream = fakeStream({ isTTY: false });
    const reporter = new Reporter({ stream, env, verbose: true, color: 'never' });

    reporter.phase(PHASES.LOAD, { completed: 284, total: 612 });

    expect(reporter.liveText).toBe('Reading files… 284/612');
  });

  // The status and the action must survive a narrow terminal; the metrics are
  // the part that can move to their own line.
  it('moves metrics to a second line at narrow widths', () => {
    const stream = fakeStream({ isTTY: true, columns: 30 });
    const reporter = new Reporter({ stream, env, color: 'never' });

    reporter.complete(model);

    const lines = stream.text.split('\n').filter(Boolean);
    expect(lines[0]).toContain('File reference copied');
    expect(lines[1].trim()).toBe('47 files · ~78k tokens');
  });

  it('restores the cursor and clears the live line on close', () => {
    jest.useFakeTimers();
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env, color: 'never' });

    reporter.start();
    reporter.phase(PHASES.LOAD);
    jest.advanceTimersByTime(200);
    expect(stream.text).toContain('\x1b[?25l');

    reporter.close();
    expect(stream.text).toContain('\x1b[?25h');
    expect(stream.text.endsWith('\x1b[?25h')).toBe(true);
  });

  // Severity and rendering format are separate axes. Collapsing them into one
  // boolean produced three contradictions: silent swallowed failures, quiet+json
  // emitted everything, and warn-level hid the warnings it was asking for.
  it('renders a failure at every level, including error-only', () => {
    const stream = fakeStream({ isTTY: false });
    const reporter = new Reporter({ stream, env, level: 'error', color: 'never' });

    reporter.complete(model);
    expect(stream.text).toBe('');

    reporter.fail({ status: 'error', headline: 'Path not found', notes: ['Check the path'] });
    expect(stream.text).toContain('Path not found');
    expect(stream.text).toContain('Check the path');
  });

  it('still reports warnings at warn level, but not successes', () => {
    const stream = fakeStream({ isTTY: false });
    const reporter = new Reporter({ stream, env, level: 'warn', color: 'never' });

    reporter.complete(model);
    expect(stream.text).toBe('');

    reporter.complete({ status: 'warning', headline: 'Saved with limits', metrics: [] });
    expect(stream.text).toContain('Saved with limits');
  });

  it('is quiet in JSON mode too, not just on a terminal', () => {
    const stream = fakeStream({ isTTY: false });
    const reporter = new Reporter({ stream, env, format: 'json', quiet: true });

    reporter.start({ target: '/p' });
    reporter.phase(PHASES.LOAD);
    reporter.note('detail');
    reporter.complete(model);
    expect(stream.text).toBe('');

    reporter.fail({ status: 'error', headline: 'Path not found' });
    expect(JSON.parse(stream.text.trim()).event).toBe('run.failed');
  });

  // `--explain` output is the entire reason the flag was passed; requiring
  // `--verbose` as well made the flag do nothing on its own.
  it('prints notes marked `always` without --verbose', () => {
    const stream = fakeStream({ isTTY: false });
    const reporter = new Reporter({ stream, env, color: 'never' });

    reporter.note('ordinary detail');
    expect(stream.text).toBe('');

    reporter.note('requested detail', { always: true });
    expect(stream.text).toContain('requested detail');
  });

  // Wrapping is lossless; eliding is not. Cutting the middle out of a sentence
  // gave "3 secrets redacted in model.js…clusionReport.js", which reads as
  // corruption rather than brevity.
  it('never elides a persistent line, however narrow the terminal', () => {
    const stream = fakeStream({ isTTY: true, columns: 24 });
    const reporter = new Reporter({ stream, env, color: 'never' });
    const note = '3 possible secrets redacted in config.js, server.js and deploy.js';

    reporter.complete({ status: 'success', headline: 'Output copied', metrics: [], notes: [note] });

    expect(stream.text).toContain(note);
    expect(stream.text).not.toContain('…');
  });

  it('is safe to close more than once', () => {
    const stream = fakeStream({ isTTY: true });
    const reporter = new Reporter({ stream, env });

    reporter.start();
    reporter.close();
    const after = stream.chunks.length;
    reporter.close();

    expect(stream.chunks.length).toBe(after);
  });
});
