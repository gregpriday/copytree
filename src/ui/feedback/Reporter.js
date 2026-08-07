import {
  detectCapabilities,
  glyph,
  glyphColor,
  statusGlyph,
  SPINNER_ASCII,
  SPINNER_FRAMES,
} from './glyphs.js';
import { PHASES, phaseLabel, formatCount, truncatePath } from './messages.js';
import { FEEDBACK_EVENTS } from './model.js';

/**
 * How long a run must take before a spinner is worth showing.
 *
 * A spinner that appears for 40ms and vanishes makes a fast command feel slower
 * than one that prints nothing until it is done. Below this threshold the run
 * produces exactly one line, which is the whole point.
 */
const SPINNER_DELAY_MS = 130;
const SPINNER_INTERVAL_MS = 80;

/**
 * Minimum time a phase label stays on screen.
 *
 * Without it a small project flickers through six labels in a tenth of a second,
 * which reads as noise rather than progress.
 */
const MIN_PHASE_MS = 90;

/** Severity ordering, mirroring the logger's own. */
const LEVELS = { error: 0, warn: 1, info: 2 };

/**
 * The severity of a completion model, for level filtering.
 * @param {Object} model - Any feedback model
 * @returns {'info'|'warn'|'error'} Severity
 */
function severityOf(model) {
  if (model?.status === 'error') return 'error';
  if (model?.status === 'warning') return 'warn';
  return 'info';
}

const COLORS = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

/**
 * The single terminal reporter.
 *
 * Everything CopyTree tells a person goes through here, and it all goes to
 * stderr. That is what keeps `copytree --display --format json | jq` valid while
 * still showing progress: stdout carries the document, stderr carries the
 * conversation about it. It also means no stage, formatter or view needs to own
 * the terminal — the one thing that most reliably corrupts both.
 */
export class Reporter {
  /**
   * @param {Object} [options]
   * @param {NodeJS.WriteStream} [options.stream=process.stderr] - Feedback stream
   * @param {boolean} [options.verbose=false] - Show phase milestones and detail
   * @param {boolean} [options.quiet=false] - Shorthand for `level: 'error'`
   * @param {'info'|'warn'|'error'} [options.level='info'] - Lowest severity worth reporting
   * @param {'text'|'json'} [options.format='text'] - Rendering format
   * @param {'auto'|'always'|'never'} [options.color='auto'] - Colour mode
   * @param {Object} [options.env=process.env] - Environment, for capability detection
   * @param {Object} [options.context={}] - Run context (format, destination)
   */
  constructor({
    stream = process.stderr,
    verbose = false,
    quiet = false,
    level = 'info',
    format = 'text',
    color = 'auto',
    env = process.env,
    context = {},
  } = {}) {
    this.stream = stream;
    this.verbose = verbose;
    // Severity and rendering format are separate axes, and collapsing them into
    // one boolean produced three contradictions at once: `--log-format silent`
    // swallowed failures, `--quiet --log-format json` still emitted every
    // event, and `--log-level warn` hid warnings it was explicitly asking for.
    // `format` now only answers "how", and `level` only answers "how much".
    this.level = quiet ? 'error' : level;
    this.format = format === 'json' ? 'json' : 'text';
    this.context = context;
    this.caps = detectCapabilities(stream, { color, env });
    this.canAnimate = this.computeCanAnimate();

    this.spinnerTimer = null;
    this.spinnerDelay = null;
    this.frame = 0;
    this.liveText = null;
    this.lineIsDirty = false;
    this.currentPhase = null;
    this.phaseStartedAt = 0;
    this.closed = false;
    this.cursorHidden = false;
    this.signalHandlers = [];
  }

  /**
   * Set the lowest severity worth reporting.
   *
   * A method rather than a field because the level also decides whether there
   * is anything to animate, and the two must never disagree — a spinner drawn
   * by a reporter that prints nothing is a line nobody ever erases.
   *
   * @param {'info'|'warn'|'error'} level - Lowest severity to report
   */
  setLevel(level) {
    this.level = LEVELS[level] === undefined ? 'info' : level;
    this.canAnimate = this.computeCanAnimate();
    if (!this.canAnimate) this.stopSpinner();
  }

  /** True when this reporter says nothing about a run that succeeds. @private */
  get quiet() {
    return !this.allows('info');
  }

  /**
   * Whether a message of the given severity should be reported at all.
   * @param {'info'|'warn'|'error'} severity - Message severity
   * @returns {boolean} True when it passes the level filter
   * @private
   */
  allows(severity) {
    return (LEVELS[severity] ?? LEVELS.info) <= (LEVELS[this.level] ?? LEVELS.info);
  }

  /** @private */
  computeCanAnimate() {
    // A spinner needs a TTY to erase its own line, and text mode to not corrupt
    // a machine-readable stream. Nothing to say means nothing to animate.
    return this.caps.isTTY && this.format === 'text' && this.allows('info');
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Begin a run. Arms the delayed spinner and installs terminal cleanup.
   * @param {Object} [info] - Run info recorded in JSON mode
   */
  start(info = {}) {
    if (this.allows('info')) this.emitJson({ event: FEEDBACK_EVENTS.RUN_START, ...info });
    this.installCleanup();
    if (!this.canAnimate) return;

    this.spinnerDelay = setTimeout(() => {
      this.spinnerDelay = null;
      this.hideCursor();
      this.spinnerTimer = setInterval(() => this.tick(), SPINNER_INTERVAL_MS);
      this.tick();
    }, SPINNER_DELAY_MS);
    // A pending spinner must never be the reason the process stays alive.
    this.spinnerDelay.unref?.();
  }

  /**
   * Move to a user-facing phase.
   * @param {string} phase - A `PHASES` value
   * @param {Object} [detail] - {completed, total, item}
   */
  phase(phase, detail = {}) {
    const now = Date.now();
    if (this.currentPhase === phase && now - this.phaseStartedAt < MIN_PHASE_MS && !detail.total) {
      return;
    }

    // Preparing is only true at the start. The tracker reports the pipeline's
    // own start and finish under no particular stage, which mapped back to
    // "Preparing" and made a run that had reached the secrets scan appear to
    // begin again. Phases move forward or stay put.
    if (phase === PHASES.PREPARE && this.currentPhase && this.currentPhase !== PHASES.PREPARE) {
      return;
    }
    this.currentPhase = phase;
    this.phaseStartedAt = now;

    const label = phaseLabel(phase, { ...this.context, ...detail });
    const counted =
      detail.total > 0
        ? `${label}… ${formatCount(detail.completed || 0)}/${formatCount(detail.total)}`
        : `${label}…`;

    if (!this.allows('info')) return;
    this.emitJson({ event: FEEDBACK_EVENTS.PHASE_CHANGE, phase, message: label, ...detail });
    this.setLive(counted);
    if (this.verbose && this.format === 'text' && !this.canAnimate) {
      this.writeLine(`${glyph('bullet', this.caps)} ${label}`, 'dim');
    }
  }

  /**
   * Report incremental progress within the current phase.
   * @param {Object} detail - {phase, completed, total, item}
   */
  progress(detail = {}) {
    if (!detail.phase) return;
    this.phase(detail.phase, detail);
  }

  /**
   * A neutral verbose milestone. Never a checkmark: work advancing is not work
   * finished, and a green tick per file trains the reader to ignore green ticks.
   * @param {string} message - Message
   */
  note(message, { always = false } = {}) {
    if (!this.allows('info')) return;
    this.emitJson({ event: FEEDBACK_EVENTS.NOTICE, message });
    if (this.format !== 'text') return;
    // `always` is for detail the caller asked for by name — `--explain` output
    // is the whole point of passing the flag, so it must not also require
    // `--verbose` to appear.
    if (!always && !this.verbose) return;
    this.writeLine(`${glyph('bullet', this.caps)} ${message}`, 'dim');
  }

  /**
   * A standalone warning, for facts that surface before the run finishes.
   * @param {{code?: string, message: string, data?: Object}} warning - Warning
   */
  warn(warning) {
    if (!this.allows('warn')) return;
    this.emitJson({ event: FEEDBACK_EVENTS.WARNING, ...warning });
    if (this.format !== 'text') return;
    this.writeLine(`${glyph('warning', this.caps)} ${warning.message}`, 'yellow');
  }

  /**
   * A stage degraded but the run continued.
   * @param {{stage?: string, message: string}} recovery - Recovery detail
   */
  recovery(recovery) {
    if (!this.allows('warn')) return;
    this.emitJson({ event: FEEDBACK_EVENTS.RECOVERY, ...recovery });
    if (!this.verbose || this.format !== 'text') return;
    this.writeLine(`${glyph('warning', this.caps)} ${recovery.message}`, 'yellow');
  }

  /**
   * Render a finished run and stop animating.
   *
   * This is the guarantee the Ink path could not make: the completion line is
   * written synchronously, on the same tick the run finishes, so a successful
   * clipboard copy can never report nothing.
   *
   * @param {Object} model - Completion model
   */
  complete(model) {
    this.stopSpinner();
    // The level gates the machine stream too. `--quiet --log-format json` used
    // to emit every event, because the JSON write happened before the quiet
    // check — quiet meant "quiet on a terminal" rather than "quiet".
    if (!this.allows(severityOf(model))) return;

    this.emitJson({ ...model, event: model.event || FEEDBACK_EVENTS.RUN_COMPLETE });
    if (this.format === 'text') this.renderModel(model);
  }

  /**
   * Render a failed run.
   * @param {Object} model - Failure model
   */
  fail(model) {
    this.stopSpinner();
    // No level and no format silences a failure. A command that exits non-zero
    // having printed nothing leaves the caller with an error code and no way to
    // find out what it means.
    this.emitJson({ ...model, event: FEEDBACK_EVENTS.RUN_FAILED });
    if (this.format === 'text') this.renderModel(model);
  }

  /**
   * Restore the terminal. Safe to call more than once.
   */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopSpinner();
    this.removeCleanup();
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  /**
   * Write a model as a headline, optional metrics, then indented detail.
   * @param {Object} model - Any feedback model
   * @private
   */
  renderModel(model) {
    const status = model.status === 'neutral' ? 'neutral' : model.status;
    // On a success there is nothing to warn about, so the leading position says
    // where the output went instead. Anything else keeps its outcome glyph.
    const symbol = statusGlyph(status, model.details?.destination, this.caps);
    const metrics = model.metrics?.length ? ` — ${model.metrics.join(' · ')}` : '';

    // Persistent lines are never elided, only rebalanced. A terminal wraps, and
    // wrapping is lossless; eliding is not. Cutting the middle out of a sentence
    // gave "3 secrets redacted in model.js…clusionReport.js", which reads as
    // corruption rather than as brevity. Only the live spinner line, which
    // cannot wrap without leaving debris behind, is fitted to the width.
    const headline = `${symbol} ${model.headline}${metrics}`;
    // At narrow widths the metrics move to their own line so the action, which
    // is the part that answers "what happened", stays on the first one.
    if (headline.length > this.caps.width && metrics) {
      this.writeLine(`${symbol} ${model.headline}`, status);
      this.writeLine(`  ${model.metrics.join(' · ')}`, 'dim');
    } else {
      this.writeLine(headline, status);
    }

    for (const note of model.notes || []) {
      this.writeLine(`  ${note}`, 'dim');
    }
    for (const warning of model.warnings || []) {
      this.writeLine(`  ${warning.message}`, 'yellow');
    }
    if (this.verbose && model.details?.path) {
      this.writeLine(`  ${model.details.path}`, 'dim');
    }
  }

  /**
   * Replace the live line, or print it once on a stream that cannot animate.
   * @param {string} text - Line content
   * @private
   */
  setLive(text) {
    this.liveText = text;
    if (!this.canAnimate || !this.spinnerTimer) return;
    this.tick();
  }

  /** Draw one spinner frame. @private */
  tick() {
    if (!this.canAnimate || this.liveText == null) return;
    const spin = this.caps.unicode
      ? SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length]
      : SPINNER_ASCII;
    this.frame += 1;
    this.clearLine();
    this.stream.write(
      this.paint(`${spin} ${this.fit(this.liveText, this.caps.width - 2)}`, 'cyan'),
    );
    this.lineIsDirty = true;
  }

  /**
   * Write one persistent line, clearing any live line first so the two never
   * overlap.
   * @param {string} text - Line content
   * @param {string} [status] - Status name, for colour
   * @private
   */
  writeLine(text, status) {
    this.clearLine();
    this.stream.write(`${this.paint(text, status)}\n`);
  }

  /** Erase the live line if one is on screen. @private */
  clearLine() {
    if (!this.lineIsDirty || !this.caps.isTTY) {
      this.lineIsDirty = false;
      return;
    }
    this.stream.write('\r\x1b[2K');
    this.lineIsDirty = false;
  }

  /**
   * Colour a string, if the stream takes colour.
   * @param {string} text - Text
   * @param {string} [status] - Status name or colour name
   * @returns {string} Possibly coloured text
   * @private
   */
  paint(text, status) {
    if (!this.caps.color || !status) return text;
    const color = COLORS[status] || COLORS[glyphColor(status)] || '';
    return color ? `${color}${text}${COLORS.reset}` : text;
  }

  /**
   * Fit the live line to one terminal row.
   *
   * Only the animated line needs this: it is erased and redrawn in place, and a
   * line that wrapped would leave the overflow behind when the row above it is
   * cleared. The middle is elided so the phase name and the counts both survive.
   *
   * @param {string} text - Text
   * @param {number} width - Available columns
   * @returns {string} Fitted text
   * @private
   */
  fit(text, width) {
    return truncatePath(text, Math.max(8, width));
  }

  /**
   * Emit one NDJSON event. No ANSI, no emoji, one object per line — the machine
   * contract is the event names and codes, not the prose.
   * @param {Object} event - Event payload
   * @private
   */
  emitJson(event) {
    if (this.format !== 'json') return;
    const { stats, details, ...rest } = event;
    const payload = { ...rest, ...(stats ? { stats } : {}), ...(details ? { details } : {}) };
    try {
      this.stream.write(`${JSON.stringify(payload)}\n`);
    } catch {
      // A feedback event must never be the thing that fails a run.
    }
  }

  // ─── Terminal housekeeping ────────────────────────────────────────────────

  /** @private */
  stopSpinner() {
    if (this.spinnerDelay) {
      clearTimeout(this.spinnerDelay);
      this.spinnerDelay = null;
    }
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.clearLine();
    this.showCursor();
    this.liveText = null;
  }

  /** @private */
  hideCursor() {
    if (!this.caps.isTTY || this.cursorHidden) return;
    this.stream.write('\x1b[?25l');
    this.cursorHidden = true;
  }

  /**
   * Restore the cursor, but only if this reporter is the one that hid it.
   *
   * Writing the show-cursor sequence unconditionally put an escape code on
   * every run, including the ones that print a single line and the ones
   * emitting NDJSON — where it corrupted the last record.
   * @private
   */
  showCursor() {
    if (!this.cursorHidden) return;
    this.stream.write('\x1b[?25h');
    this.cursorHidden = false;
  }

  /**
   * Restore the terminal however the process ends.
   *
   * Only `exit` is claimed here, and it runs synchronously. Signals are
   * deliberately left alone: attaching a SIGINT listener suppresses Node's
   * default termination, so a reporter that took it over would turn Ctrl+C into
   * a hang. Cancellation is the CLI's decision to make; this hook exists so the
   * cursor comes back regardless of who makes it.
   * @private
   */
  installCleanup() {
    if (this.signalHandlers.length > 0) return;
    const handler = () => this.close();
    process.on('exit', handler);
    this.signalHandlers.push(['exit', handler]);
  }

  /** @private */
  removeCleanup() {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers = [];
  }
}

/**
 * Create the reporter appropriate to the current invocation.
 *
 * @param {Object} [options] - See {@link Reporter}
 * @returns {Reporter} A reporter
 */
export function createReporter(options = {}) {
  return new Reporter(options);
}

export default Reporter;
