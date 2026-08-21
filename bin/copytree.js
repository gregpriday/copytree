#!/usr/bin/env node

/**
 * The CopyTree entry point.
 *
 * Order matters here, and it is the order in section 19.8 of the CLI
 * specification: answer `--version` before building anything, parse and
 * validate before importing a handler, and import optional Git, clipboard,
 * transformer, converter or profiler code only when a run actually reaches it.
 * `copytree --help` should cost about as much as printing a string.
 *
 * This file owns three things nothing below it may touch: the process exit
 * code, the terminal, and signal handlers. Command handlers return values and
 * throw typed errors; they never call `process.exit`.
 */

import { VERSION } from '../src/version.js';

// `--version` is the one invocation with no work behind it, so it should carry
// no graph behind it either. Answered here, before Commander is asked to build
// a command with sixty options and their parsers, and before anything reaches
// the logger — which pulls in Chalk and the configuration system.
//
// Restricted to the exact single-argument forms on purpose. `copytree --version
// extra` is a mistake, and Commander gives a better account of it than this
// would.
if (process.argv.length === 3 && (process.argv[2] === '--version' || process.argv[2] === '-V')) {
  // Awaited rather than written-and-exited. `process.exit()` terminates
  // immediately, and when stdout is a pipe or a file rather than a TTY the
  // write may not have reached the OS yet — so `copytree --version > f` could
  // produce an empty file. The callback fires once the data is flushed.
  await new Promise((resolve) => process.stdout.write(`${VERSION}\n`, resolve));
  process.exit(0);
}

const { buildProgram } = await import('../src/cli/program.js');
const {
  buildCopyRequest,
  buildQueryRequest,
  expandLegacyVariadic,
  providedOptionIds,
  rejectRemovedOptions,
} = await import('../src/cli/request.js');
const { commandById } = await import('../src/cli/schema.js');

/**
 * The handler module for a command, relative to `src/`.
 *
 * Declared on the command spec, imported here, and never earlier: an inspection
 * command should not pay for the copy pipeline, and `copytree doctor` should
 * not build a transformer registry to find out whether one can be built.
 */
const HANDLERS = Object.freeze({
  copy: () => import('../src/commands/copy.js'),
  plan: () => import('../src/commands/plan.js'),
  inspect: () => import('../src/commands/inspect.js'),
  explain: () => import('../src/commands/explain.js'),
  'ignore.context': () => import('../src/commands/ignore.js'),
  'ignore.check': () => import('../src/commands/ignore.js'),
  'ignore.init': () => import('../src/commands/ignore.js'),
  'config.show': () => import('../src/commands/config.js'),
  'config.validate': () => import('../src/commands/config.js'),
  'config.migrate': () => import('../src/commands/config.js'),
  'cache.status': () => import('../src/commands/cache.js'),
  'cache.clear': () => import('../src/commands/cache.js'),
  'cache.gc': () => import('../src/commands/cache.js'),
  doctor: () => import('../src/commands/doctor.js'),
  completion: () => import('../src/commands/completion.js'),
  'debug.profile': () => import('../src/commands/debugProfile.js'),
  help: () => import('../src/commands/help.js'),
});

/** Commands whose request is a copy request rather than a query request. */
const COPY_LIKE = new Set(['copy', 'debug.profile']);

/**
 * The operation name a handler switches on.
 * @param {string} id - Command id
 * @returns {string} Operation name
 */
function operationFor(id) {
  return id.replaceAll('.', '-');
}

/**
 * Everything after the command path, for provided-option detection.
 *
 * Commander does not expose the slice of argv that belonged to a subcommand, so
 * it is recovered from the command path length. Over-including is harmless:
 * a token can only match an option this command declares.
 *
 * @param {import('../src/cli/schema.js').CommandSpec} spec - Command spec
 * @param {string} [legacyName] - Legacy alias, when one was used
 * @returns {string[]} Argument tokens
 */
function argvForCommand(spec, legacyName) {
  const argv = effectiveArgv.slice(2);
  const consumed = legacyName ? 1 : spec.isDefault ? 0 : spec.path.length;
  return argv.slice(consumed);
}

/**
 * Build the canonical request for a command invocation.
 *
 * @param {import('../src/cli/schema.js').CommandSpec} spec - Command spec
 * @param {Object} invocation - Parsed invocation
 * @returns {{request: Object, notices: Array}} Canonical request and notices
 */
function buildRequest(spec, invocation) {
  const argv = argvForCommand(spec, invocation.legacyName);
  const provided = providedOptionIds(spec, argv);
  const options = invocation.options;
  const positional = invocation.args;

  // `--dry-run` is the plan command under its old name. Translating it here
  // rather than keeping a preview mode inside the copy pipeline is the whole
  // point of having a `plan` command: one implementation, one answer.
  if (spec.id === 'copy' && provided.has('dryRun')) {
    const planSpec = commandById('plan');
    const { request, notices } = buildQueryRequest(planSpec, options, {
      provided,
      target: positional[0] ?? '.',
      operation: 'plan',
    });
    notices.push({
      kind: 'deprecation',
      code: 'ERR_DEPRECATED_OPTION',
      message: "--dry-run is deprecated; use 'copytree plan'",
    });
    // `--format xml` is a document format, not a plan-report format. A dry run
    // that inherited it would ask the plan renderer for XML it cannot produce.
    request.report.format = ['text', 'json', 'ndjson'].includes(options.format)
      ? options.format
      : 'text';
    // `--output` on the old dry run named where the *export* would have gone,
    // and the run deliberately did not write it. Letting it become the plan
    // report's destination would overwrite the very file the preview existed
    // to avoid touching.
    request.report.output = null;
    return { request, notices, handlerId: 'plan' };
  }

  if (COPY_LIKE.has(spec.id)) {
    const { request, notices } = buildCopyRequest(spec, options, {
      provided,
      target: positional[0] ?? '.',
    });

    if (spec.id === 'debug.profile') {
      request.profiler = {
        type: options.type ?? 'cpu',
        outputDir: options.outputDir ?? '.profiles',
      };
    }

    return { request, notices };
  }

  const { request, notices } = buildQueryRequest(spec, options, {
    provided,
    target: spec.id === 'explain' ? (options.root ?? '.') : (positional[0] ?? '.'),
    operation: operationFor(spec.id),
  });

  if (spec.id === 'explain') request.entries = positional[0] ?? [];
  if (spec.id === 'completion') request.shell = positional[0];
  if (spec.id === 'help') request.commandPath = positional[0] ?? [];
  if (spec.path[0] === 'cache') {
    request.report.transformations = options.transformations === true;
    request.report.references = options.references === true;
    request.report.repositories = options.repositories === true;
    request.report.retentionDays = options.retentionDays ?? null;
  }
  if (spec.path[0] === 'config') {
    request.report.section = options.section ?? null;
    request.report.sources = options.sources === true;
    request.report.showSecrets = options.showSecrets === true;
    request.report.force = options.force === true;
    request.report.write = options.write === true;
  }

  return { request, notices };
}

/**
 * Run one command.
 * @param {import('../src/cli/schema.js').CommandSpec} spec - Command spec
 * @param {Object} invocation - Parsed invocation
 * @returns {Promise<void>}
 */
async function run(spec, invocation) {
  const { request, notices, handlerId } = buildRequest(spec, invocation);

  if (invocation.legacyName) {
    notices.push({
      kind: 'deprecation',
      message: `'copytree ${invocation.legacyName}' is deprecated; use 'copytree ${spec.path.join(' ')}'`,
      code: 'ERR_DEPRECATED_OPTION',
    });
  }

  for (const flag of expandedFlags) {
    notices.push({
      kind: 'deprecation',
      code: 'ERR_DEPRECATED_OPTION',
      message: `${flag} takes one value per occurrence; write ${flag} <value> ${flag} <value>`,
    });
  }

  // Section 19.8: target existence is checked before the handler — and
  // therefore before the pipeline, the configuration system and the
  // transformers — are imported. A mistyped path should cost a `stat`.
  //
  // Only for commands whose target is a path: `completion zsh` and
  // `help plan` take a shell and a command name, neither of which is a file.
  if (takesPathTarget(spec)) await assertTargetExists(request.target);

  const loader = HANDLERS[handlerId ?? spec.id];
  if (!loader) throw new Error(`No handler registered for ${handlerId ?? spec.id}`);

  const { default: handler } = await loader();
  await handler(request, { notices, signal: cancellation.signal });
}

/**
 * Whether a command's target is a filesystem path.
 *
 * `explain` is included because its `--root` is one, even though its
 * positionals are not.
 *
 * @param {import('../src/cli/schema.js').CommandSpec} spec - Command spec
 * @returns {boolean} True when the target should exist on disk
 */
function takesPathTarget(spec) {
  if (spec.id === 'explain') return true;
  return (spec.positionals ?? []).some((positional) => positional.name === 'path');
}

/**
 * Fail early on a target that does not exist.
 *
 * Remote targets are not checked here: resolving one means cloning it, which is
 * the handler's business and not something to do during validation.
 *
 * @param {string|undefined} target - The requested target
 * @returns {Promise<void>}
 */
async function assertTargetExists(target) {
  if (!target || /^https?:\/\//i.test(target)) return;

  const { stat } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const resolved = resolve(target);

  try {
    await stat(resolved);
  } catch {
    const { CopyTreeError, ERROR_CODES } = await import('../src/utils/errors.js');
    throw new CopyTreeError(`Path does not exist: ${resolved}`, ERROR_CODES.PATH_NOT_FOUND, {
      path: target,
    });
  }
}

/**
 * Report a failure the way section 20 of the specification requires: a title,
 * the offending value, a remediation, and a stable code.
 *
 * @param {Error} error - The failure
 * @returns {Promise<number>} Process exit code
 */
async function reportFailure(error) {
  const { describeError, exitCodeFor, isAbortError } = await import('../src/utils/errors.js');

  // A run asked for machine feedback gets machine feedback all the way to the
  // end. Three lines of prose appended to an NDJSON stream is a stream nobody
  // can parse.
  const jsonFeedback = wantsJsonFeedback();

  if (isAbortError(error)) {
    // Already reported by the run reporter, which erased its live line first.
    if (!error.reported) {
      process.stderr.write(
        jsonFeedback
          ? `${JSON.stringify({ schema: 'copytree-feedback@1', event: 'run.cancelled' })}\n`
          : 'Cancelled\n',
      );
    }
    return exitCodeFor(error);
  }

  // A run that already reported through the terminal reporter has had its live
  // line erased and its failure printed once, with the same description this
  // would build. Printing it again is not more information.
  if (error?.reported) return exitCodeFor(error);

  const description = describeError(error);

  if (jsonFeedback) {
    process.stderr.write(
      `${JSON.stringify({
        schema: 'copytree-feedback@1',
        event: 'run.failed',
        status: 'error',
        code: description.code,
        message: description.subject
          ? `${description.title}: ${description.subject}`
          : description.title,
        ...(description.suggestion ? { remediation: description.suggestion } : {}),
      })}\n`,
    );
    return exitCodeFor(error);
  }

  const lines = [description.title];
  if (description.subject) lines[0] = `${description.title}: ${description.subject}`;
  if (description.suggestion) lines.push(description.suggestion);
  lines.push(`[${description.code}]`);

  process.stderr.write(`${lines.join('\n')}\n`);

  if (process.env.COPYTREE_DEBUG === '1' && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }

  return exitCodeFor(error);
}

/**
 * Whether the caller asked for machine-readable feedback.
 *
 * Read from argv rather than from the parsed request, because a failure can
 * happen before there is a request to read.
 *
 * @returns {boolean} True when `--log-format json` was given
 */
function wantsJsonFeedback() {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--log-format');
  if (index !== -1 && argv[index + 1] === 'json') return true;
  return argv.includes('--log-format=json');
}

/**
 * The one cancellation source for the run.
 *
 * Handed to every handler, which threads it into the pipeline, the walkers, the
 * writers and any child process. Nothing else creates an `AbortController` for
 * the CLI.
 */
const cancellation = new AbortController();

/** Whether the terminal has already been restored and the outcome reported. */
let cancelled = false;

/**
 * Put the terminal back the way it was found.
 *
 * Node's default signal handling kills the process outright, which skips `exit`
 * listeners — so a run interrupted mid-spinner would leave the cursor hidden
 * and the live line half-drawn.
 */
function restoreTerminal() {
  if (process.stderr.isTTY) {
    process.stderr.write('\r\x1b[2K\x1b[?25h');
  }
}

/**
 * Ctrl+C is a decision, not a fault.
 *
 * The first signal *cancels* rather than exits. That distinction is the whole
 * point: exiting immediately skips every cleanup path, so a run interrupted
 * while writing left a half-written export at the destination, a temporary
 * reference file behind, a profiler session open and a `git clone` still
 * running as an orphan. Aborting instead lets each of those unwind — the
 * atomic writer discards its temporary file and leaves the previous export
 * intact — and the run then reports the outcome as what it is: a cancellation,
 * in the neutral status, with no stack trace.
 *
 * A second signal is an instruction to stop waiting, and is honoured
 * immediately. Cleanup that hangs must never trap someone in their own
 * terminal.
 *
 * @param {string} signal - Signal name
 */
function onCancel(signal) {
  if (cancelled) {
    restoreTerminal();
    process.exit(130);
  }

  cancelled = true;
  cancellation.abort(new DOMException(`Cancelled by ${signal}`, 'AbortError'));

  restoreTerminal();
  process.stderr.write(`${process.stderr.isTTY ? '○' : '-'} Cancelled\n`);
  process.exitCode = 130;

  // If the run does not unwind promptly, stop waiting for it. Without this a
  // stage that ignores the signal would leave Ctrl+C looking like it did
  // nothing at all.
  const forced = setTimeout(() => process.exit(130), 2000);
  forced.unref();
}

process.on('SIGINT', () => onCancel('SIGINT'));
process.on('SIGTERM', () => onCancel('SIGTERM'));

// Legacy variadic spellings are rewritten before the parser sees them, so the
// parser only ever deals in the canonical one-value-per-occurrence form.
const { argv: effectiveArgv, expanded: expandedFlags } = expandLegacyVariadic(process.argv);

const program = buildProgram({ run });

try {
  // Removed options are rejected before the parser sees them, so the error can
  // name the replacement instead of Commander's "unknown option".
  rejectRemovedOptions(effectiveArgv.slice(2));
  await program.parseAsync(effectiveArgv);
} catch (error) {
  // Commander throws for help and version too; those are successful outcomes.
  if (error?.code === 'commander.helpDisplayed' || error?.code === 'commander.version') {
    process.exitCode = 0;
  } else if (typeof error?.code === 'string' && error.code.startsWith('commander.')) {
    // Commander has already written the problem statement. What it does not
    // write is a remediation or a stable code, which section 20 requires of
    // every user-facing error.
    if (error.exitCode !== 0) {
      process.stderr.write(
        "Run 'copytree --help' for the command list, or 'copytree <command> --help' for its options.\n" +
          '[ERR_INVALID_OPTION]\n',
      );
    }
    process.exitCode = error.exitCode === 0 ? 0 : 2;
  } else if (cancelled) {
    // The signal handler has already restored the terminal, said "Cancelled"
    // and set exit 130. Whatever the run threw on its way out is the
    // *consequence* of that cancellation, not a second thing that went wrong,
    // and reporting it would tell the user their deliberate Ctrl+C was a
    // failure.
    process.exitCode = 130;
  } else {
    process.exitCode = await reportFailure(error);
  }
}
