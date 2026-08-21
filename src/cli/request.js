/**
 * One canonical request, built once, from any spelling.
 *
 * The parser is the only place that knows an option was spelled `--filter`
 * rather than `--include`, or `--display` rather than `--stdout`. Below this
 * module nothing does: stages, renderers and the SDK all read canonical fields.
 * That is what makes a deprecation window cheap — an alias is a line in the
 * schema and a line here, not a second code path through the pipeline.
 */

import path from 'path';
import { ERROR_CODES, ValidationError, PolicyError } from '../utils/errors.js';
import {
  LEGACY_PROFILER_VALUES,
  longFlagOf,
  optionsOf,
  REMOVED_COPY_OPTIONS,
  REMOVED_OPTION_VALUES,
} from './schema.js';

/**
 * @typedef {Object} Notice
 * @property {'deprecation'|'security'} kind - What sort of notice this is
 * @property {string} message - One line, already phrased for a human
 * @property {string} [code] - Stable machine code
 */

/**
 * Raise a usage error with a code, a subject and a remediation.
 *
 * @param {string} message - Problem statement, not the remediation
 * @param {string} code - One of {@link ERROR_CODES}
 * @param {Object} [details={}] - `value`, `suggestion`, `field`
 * @returns {never} Always throws
 */
function usageError(message, code, details = {}) {
  throw new ValidationError(message, details.field || 'options', details.value ?? null, {
    code,
    ...details,
  });
}

/**
 * Reject contradictory or incomplete option combinations, from the schema.
 *
 * Declared once as data next to the options themselves, so a new conflict is a
 * property rather than an `if` somewhere in a handler that the next reader has
 * to find.
 *
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @param {Set<string>} provided - Option ids actually supplied on the command line
 */
export function validateOptionCombinations(command, provided) {
  const options = optionsOf(command);
  const byId = new Map(options.map((option) => [option.id, option]));
  const flag = (id) => (byId.has(id) ? longFlagOf(byId.get(id)) : `--${id}`);

  const reported = new Set();
  for (const option of options) {
    if (!provided.has(option.id)) continue;

    for (const other of option.conflicts || []) {
      if (!provided.has(other)) continue;
      const pair = [option.id, other].sort().join('|');
      if (reported.has(pair)) continue;
      reported.add(pair);

      const isDestination = (option.conflicts || []).includes('stdout') || option.id === 'stdout';
      usageError(
        `${flag(option.id)} and ${flag(other)} cannot be combined`,
        isDestination ? ERROR_CODES.DESTINATION_CONFLICT : ERROR_CODES.OPTION_CONFLICT,
        {
          value: [flag(option.id), flag(other)],
          suggestion: isDestination
            ? 'Use exactly one of --reference, --clipboard, --stdout or --output'
            : `Choose one of ${flag(option.id)} or ${flag(other)}`,
        },
      );
    }

    if (option.requires && option.requires.length > 0) {
      const satisfied = option.requires.some((id) => provided.has(id));
      if (!satisfied) {
        usageError(
          `${flag(option.id)} requires ${option.requires.map(flag).join(' or ')}`,
          ERROR_CODES.OPTION_REQUIRES,
          {
            value: flag(option.id),
            suggestion: `Add ${option.requires.map(flag).join(' or ')}, or drop ${flag(option.id)}`,
          },
        );
      }
    }
  }
}

/**
 * Reject an option that was removed rather than renamed.
 *
 * "Unknown option" is a true statement and a useless one when the option
 * existed last week. Naming the replacement is the difference between a
 * one-second fix and a documentation hunt.
 *
 * @param {string[]} argv - Raw argument vector
 */
export function rejectRemovedOptions(argv) {
  for (const removed of REMOVED_COPY_OPTIONS) {
    const long = removed.flags.match(/--[a-z0-9-]+/i)?.[0];
    if (!long) continue;
    const used = argv.some((arg) => arg === long || arg.startsWith(`${long}=`));
    if (!used) continue;

    usageError(`${long} has been removed`, ERROR_CODES.DEPRECATED_OPTION, {
      value: long,
      suggestion: removed.replacedBy ? `Use ${removed.replacedBy}. ${removed.note}` : removed.note,
    });
  }

  rejectRemovedValues(argv);
}

/**
 * Reject an option *value* that was removed, naming its replacement.
 *
 * A removed value falls through to the enum check otherwise, which reports it
 * as invalid alongside a list of the valid ones — true, and no help at all to
 * someone whose script has said `--binary convert` since last month.
 *
 * @param {string[]} argv - Raw argument vector
 */
function rejectRemovedValues(argv) {
  for (const [optionId, values] of Object.entries(REMOVED_OPTION_VALUES)) {
    const long = `--${optionId}`;

    for (const [value, detail] of Object.entries(values)) {
      const used = argv.some(
        (arg, index) => arg === `${long}=${value}` || (arg === long && argv[index + 1] === value),
      );
      if (!used) continue;

      usageError(`${long} ${value} has been removed`, ERROR_CODES.DEPRECATED_OPTION, {
        value,
        suggestion: `Use ${long} ${detail.replacement} — ${detail.reason}.`,
      });
    }
  }
}

/**
 * Options that used to be variadic, and the values they greedily consumed.
 *
 * `--scope src package.json` was valid, and is documented, so it keeps working.
 * The canonical form is one value per occurrence, because with a variadic
 * option a reader cannot tell where the values stop and the next positional
 * begins — which is precisely why the target path has to be written before
 * these options, exactly as it always did.
 */
const LEGACY_VARIADIC_FLAGS = Object.freeze({
  '--scope': '--scope',
  '--exclude': '--exclude',
  '-x': '--exclude',
  '--filter': '--filter',
  '-f': '--filter',
  '--always': '--always',
});

/**
 * Rewrite legacy variadic usage into one value per occurrence.
 *
 * Greedy, matching what the variadic parser did, so no command line that
 * worked before changes meaning. It only changes shape.
 *
 * @param {string[]} argv - Full argument vector (including node and script)
 * @returns {{argv: string[], expanded: string[]}} Rewritten argv, and which flags were expanded
 */
export function expandLegacyVariadic(argv) {
  const head = argv.slice(0, 2);
  const tail = argv.slice(2);
  const out = [];
  const expanded = new Set();

  for (let index = 0; index < tail.length; index += 1) {
    const token = tail[index];
    out.push(token);

    if (token === '--') {
      out.push(...tail.slice(index + 1));
      break;
    }

    const canonical = LEGACY_VARIADIC_FLAGS[token];
    if (!canonical) continue;

    // The first value belongs to this occurrence; each additional one becomes
    // its own occurrence of the same flag.
    let consumed = 0;
    while (index + 1 < tail.length && !tail[index + 1].startsWith('-')) {
      index += 1;
      if (consumed > 0) {
        out.push(token);
        expanded.add(canonical);
      }
      out.push(tail[index]);
      consumed += 1;
    }
  }

  return { argv: [...head, ...out], expanded: [...expanded] };
}

/**
 * Collect deprecation notices for the spellings that were used.
 *
 * One notice per invocation per option, on stderr, at warn severity — so a
 * quiet run and a `COPYTREE_LOG_LEVEL=error` run stay silent, and a script that
 * has not been updated still works while telling its author what to change.
 *
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @param {Set<string>} provided - Option ids actually supplied
 * @returns {Notice[]} Notices to emit
 */
export function deprecationNotices(command, provided) {
  const notices = [];
  for (const option of optionsOf(command)) {
    if (!option.replacedBy || !provided.has(option.id)) continue;
    notices.push({
      kind: 'deprecation',
      code: ERROR_CODES.DEPRECATED_OPTION,
      message: `${longFlagOf(option)} is deprecated; use ${option.replacedBy}`,
    });
  }
  return notices;
}

/**
 * Which options were actually typed, read from the argument vector.
 *
 * Taken from argv rather than from the parser's value map because the two
 * answer different questions. A parser default and an explicit `--reference`
 * produce the same value, and the difference decides whether a destination
 * conflict exists and whether a deprecation notice is owed. Negated pairs like
 * `--profile` / `--no-profile` also collapse onto one parser key, and they are
 * distinct options here.
 *
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @param {string[]} argv - Arguments after the command path
 * @returns {Set<string>} Option ids that appear in argv
 */
export function providedOptionIds(command, argv) {
  // Which short letters this command declares, and which of them take a value.
  // `-oreport` is `--output report`, not six flags: the first short letter that
  // takes a value ends the cluster and the rest is its argument, exactly as
  // Commander reads it.
  const shortsWithValue = new Set();
  const knownShorts = new Set();
  for (const option of optionsOf(command)) {
    for (const flag of option.flags.split(/[ ,|]+/)) {
      if (!/^-[a-zA-Z]$/.test(flag)) continue;
      knownShorts.add(flag.slice(1));
      if (/[<[]/.test(option.flags)) shortsWithValue.add(flag.slice(1));
    }
  }

  const longs = new Set();
  const shortLetters = new Set();

  for (const arg of argv) {
    // Everything after `--` is a positional, whatever it looks like.
    if (arg === '--') break;
    if (!arg.startsWith('-') || arg === '-') continue;

    if (arg.startsWith('--')) {
      longs.add(arg.split('=')[0]);
      continue;
    }

    for (const letter of arg.slice(1).split('')) {
      if (!knownShorts.has(letter)) break;
      shortLetters.add(letter);
      if (shortsWithValue.has(letter)) break;
    }
  }

  const provided = new Set();
  for (const option of optionsOf(command)) {
    for (const flag of option.flags.split(/[ ,|]+/).filter((part) => part.startsWith('-'))) {
      if (flag.startsWith('--')) {
        if (longs.has(flag)) provided.add(option.id);
      } else if (/^-[a-zA-Z]$/.test(flag) && shortLetters.has(flag.slice(1))) {
        provided.add(option.id);
      }
    }
  }

  return provided;
}

/**
 * Normalize an option that may be a single value or an array into an array.
 * @param {*} value - Raw value
 * @returns {Array} Values
 */
function list(value) {
  if (value === undefined || value === null || value === false) return [];
  return Array.isArray(value) ? value.filter((entry) => entry != null) : [value];
}

/**
 * Which destination the options select, and where it writes.
 *
 * `-o -` is the one alias worth special-casing: a great many tools accept it,
 * and writing a file literally named `-` is never what someone meant.
 *
 * @param {Object} raw - Parsed options
 * @param {Set<string>} provided - Option ids actually supplied
 * @returns {{type: string, path: string|null, reveal: boolean}} Destination
 */
/**
 * Every option that names a destination, canonical and deprecated alike.
 *
 * The deprecated spellings are here because a contradiction is a contradiction
 * whichever names it was written with: `--clipboard --display` states two
 * intentions, and silently honouring one of them is the wrong answer.
 */
const DESTINATION_OPTIONS = Object.freeze([
  ['output', '--output'],
  ['stdout', '--stdout'],
  ['clipboard', '--clipboard'],
  ['reference', '--reference'],
  ['display', '--display'],
]);

// `-r/--as-reference` is deliberately absent: it was documented as a legacy
// no-op meaning "the default", so a command line that pairs it with `-o` was
// always valid and always wrote a file. Promoting it to a competing
// destination would break those command lines to make a point.

function resolveDestinationRequest(raw, provided) {
  const named = DESTINATION_OPTIONS.filter(([id]) => provided.has(id));
  if (named.length > 1) {
    const flags = named.map(([, flag]) => flag);
    usageError(
      `Invalid output destination: ${flags.join(' and ')} were both supplied`,
      ERROR_CODES.DESTINATION_CONFLICT,
      {
        value: flags,
        suggestion: 'Choose one output destination: --reference, --clipboard, --stdout or --output',
      },
    );
  }

  const reveal = raw.reveal === true;
  // Streaming is *how* a document is written, not *where* it goes. Only stdout
  // and a file can be streamed to; there is no way to stream to a clipboard.
  const streamed = provided.has('stream');

  if (provided.has('output')) {
    if (raw.output === '-') return { type: 'stdout', path: null, reveal: false, streamed };
    return { type: 'file', path: raw.output, reveal, streamed };
  }
  if (provided.has('stdout') || provided.has('display')) {
    return { type: 'stdout', path: null, reveal: false, streamed };
  }
  if (provided.has('clipboard')) {
    return { type: 'clipboard', path: null, reveal: false, streamed: false };
  }
  if (provided.has('reference') || provided.has('asReference')) {
    return { type: 'reference', path: null, reveal, streamed: false };
  }
  // `--stream` alone used to be a destination in its own right. It means stdout.
  if (streamed) return { type: 'stdout', path: null, reveal: false, streamed: true };

  return { type: 'reference', path: null, reveal, streamed: false };
}

/** Extensions that name a format unambiguously enough to infer from. */
const FORMAT_BY_EXTENSION = Object.freeze({
  '.xml': 'xml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.json': 'json',
  '.ndjson': 'ndjson',
  '.jsonl': 'ndjson',
  '.sarif': 'sarif',
  '.tree': 'tree',
});

/**
 * Infer an output format from a filename, when none was requested.
 *
 * An unrecognised extension does not change the default. `.txt` deliberately
 * infers nothing: a text file is not evidence that a tree was wanted.
 *
 * @param {string|null} outputPath - Destination path
 * @returns {string|null} Inferred format, or null
 */
export function inferFormat(outputPath) {
  if (!outputPath) return null;
  return FORMAT_BY_EXTENSION[path.extname(outputPath).toLowerCase()] ?? null;
}

/**
 * Legacy `--profile cpu|heap|all` means "run a profiler"; anything else names a
 * file-selection profile.
 *
 * The collision is the one genuinely ambiguous rename in the migration, so it
 * is resolved by value rather than by guessing, and only for the three values
 * that ever worked.
 *
 * @param {Object} raw - Parsed options
 * @returns {{profileName: string|null, profilerType: string|null}} Split result
 */
function splitProfileOption(raw) {
  if (typeof raw.profile !== 'string') return { profileName: null, profilerType: null };
  if (LEGACY_PROFILER_VALUES.includes(raw.profile)) {
    return { profileName: null, profilerType: raw.profile };
  }
  return { profileName: raw.profile, profilerType: null };
}

/**
 * The selection half of a request, shared by copy, plan, inspect and explain.
 *
 * @param {Object} raw - Parsed options
 * @param {Set<string>} provided - Option ids actually supplied
 * @returns {Object} Selection request
 */
export function buildSelectionRequest(raw, provided) {
  const { profileName } = splitProfileOption(raw);

  const gitMode = raw.modified
    ? 'modified'
    : raw.staged
      ? 'staged'
      : raw.changed
        ? 'changed'
        : null;

  return {
    // `--no-profile` and the legacy `--no-folder-profile` both arrive as `false`
    // on their positive key, which is Commander's convention.
    profileName: profileName ?? (typeof raw.folderProfile === 'string' ? raw.folderProfile : null),
    profileDisabled: raw.profile === false || raw.folderProfile === false,
    scopes: list(raw.scope),
    // Legacy `--filter` replaced the profile's include list; `--include` narrows
    // it. With no profile the two are indistinguishable, which is why the rename
    // is safe for every command line that already exists.
    includes: [...list(raw.include), ...list(raw.filter)],
    excludes: list(raw.exclude),
    forceIncludes: [...list(raw.forceInclude), ...list(raw.always)],
    extensions: list(raw.ext),
    maxDepth: raw.maxDepth ?? null,
    noTests: raw.tests === false,
    git: gitMode ? { mode: gitMode, ref: gitMode === 'changed' ? raw.changed : null } : null,
    gitStatus: raw.gitStatus === true || raw.withGitStatus === true,
    dedupe: raw.dedupe === true,
    scopeIncludeIgnored: raw.scopeIncludeIgnored === true,
    scopeIncludeDefaultExcluded:
      raw.scopeIncludeDefaultExcluded === true || raw.scopeIncludeConfigExcluded === true,
    sort: raw.sort ?? 'path',
    order: raw.order ?? raw.sortOrder ?? 'asc',
    provided: {
      includes: provided.has('include') || provided.has('filter'),
      scopes: provided.has('scope'),
      sort: provided.has('sort'),
    },
  };
}

/**
 * The budget half of a request.
 *
 * Sizes arrive already parsed to bytes, because the schema declares them as
 * sizes and the parser enforces that at parse time.
 *
 * @param {Object} raw - Parsed options
 * @returns {Object} Budget request
 */
export function buildBudgetRequest(raw) {
  return {
    // `--no-size-gate` arrives as `sizeGate: false`.
    sizeGate: raw.sizeGate === false ? false : (raw.sizeGate ?? null),
    maxTotalSize: raw.maxTotalSize ?? null,
    // `--head` was the same operation as `--max-files` with a different name.
    maxFiles: raw.maxFiles ?? raw.head ?? null,
    maxChars: raw.maxChars ?? (raw.charLimit != null ? Number(raw.charLimit) : null),
    retainOversizedFirstFile: raw.retainOversizedFirstFile ?? null,
  };
}

/**
 * The feedback half of a request.
 * @param {Object} raw - Parsed options
 * @returns {Object} Feedback request
 */
export function buildFeedbackRequest(raw) {
  return {
    quiet: raw.quiet === true,
    verbose: raw.verbose === true,
    logLevel: raw.debug === true ? 'debug' : (raw.logLevel ?? null),
    logFormat: raw.logFormat ?? 'text',
    color: raw.color === false ? false : true,
  };
}

/**
 * Build the canonical request for a copy.
 *
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @param {Object} raw - Parsed options
 * @param {Object} context - Parse context
 * @param {Set<string>} context.provided - Option ids actually supplied
 * @param {string} [context.target='.'] - Positional target
 * @returns {{request: Object, notices: Notice[]}} Canonical request and notices
 */
export function buildCopyRequest(command, raw, context) {
  const provided = context.provided;
  const notices = deprecationNotices(command, provided);

  validateOptionCombinations(command, provided);

  const destination = resolveDestinationRequest(raw, provided);

  // Streaming has no way to reach a clipboard. This used to resolve silently in
  // favour of the stream, so `--stream --clipboard` succeeded, said nothing,
  // and left the clipboard untouched.
  if (provided.has('stream') && !destination.streamed) {
    usageError(
      `--stream cannot be combined with --${destination.type === 'reference' ? 'reference' : 'clipboard'}`,
      ERROR_CODES.DESTINATION_CONFLICT,
      {
        value: ['--stream', `--${destination.type}`],
        suggestion: 'Stream to stdout or to --output, or drop --stream',
      },
    );
  }

  // Format inference only fills a gap; it never overrules an explicit request.
  const formatExplicit = provided.has('format');
  let format = raw.format ?? null;
  let formatInferred = false;
  if (!format && destination.type === 'file') {
    const inferred = inferFormat(destination.path);
    if (inferred) {
      format = inferred;
      formatInferred = true;
    }
  }
  if (!format) format = 'xml';

  const { profilerType } = splitProfileOption(raw);
  if (profilerType) {
    notices.push({
      kind: 'deprecation',
      code: ERROR_CODES.DEPRECATED_OPTION,
      message: `--profile ${profilerType} is deprecated; use copytree debug profile --type ${profilerType}`,
    });
  }

  const strict = raw.strict === true;

  // `--secrets off` weakens a safety default, so it says so out loud unless the
  // caller has asked for silence.
  const secrets = raw.secrets ?? legacySecretsPolicy(raw);
  if (secrets === 'off') {
    notices.push({
      kind: 'security',
      code: 'SECRETS_DISABLED',
      message: 'Secret detection is disabled; credentials in these files will be emitted verbatim',
    });
  }

  const request = {
    operation: 'copy',
    target: context.target ?? '.',
    selection: buildSelectionRequest(raw, provided),
    content: {
      format,
      formatExplicit,
      formatInferred,
      // `--no-content` and the legacy `--only-tree` both mean "structure, no
      // bodies". Neither changes the format: `--format tree` is what renders a
      // tree, and conflating the two produced different documents from the same
      // flags depending on which code path ran.
      //
      // The implication runs the other way, though: a tree has nowhere to put a
      // file body, so `--format tree` never reads one. Loading content for a
      // document that cannot show it is wasted I/O, and it dragged the secret
      // scanner over files the output would never contain.
      includeContent: format !== 'tree' && raw.content !== false && raw.onlyTree !== true,
      lineNumbers: raw.lineNumbers === true || raw.withLineNumbers === true,
      binary: raw.binary ?? (raw.includeBinary === true ? 'base64' : 'default'),
      // Optional metadata is on by default; `--no-metadata` strips it while
      // leaving the schema/version fields every consumer parses.
      metadata: raw.metadata !== false,
      instructions: typeof raw.instructions === 'string' ? raw.instructions : null,
      includeInstructions: raw.instructions !== false,
      reproducible: raw.reproducible === true,
    },
    budgets: buildBudgetRequest(raw),
    security: {
      secrets,
      redaction: raw.redaction ?? raw.secretsRedactMode ?? null,
      secretsReport: raw.secretsReport ?? null,
      failEmpty: raw.failEmpty === true || strict,
      failOnTruncation: raw.failOnTruncation === true || strict,
      failOnFsErrors: raw.failOnFsErrors === true || strict,
      strict,
    },
    destination,
    feedback: buildFeedbackRequest(raw),
    transformCache: raw.transformCache !== false,
    // `--explain` on a copy reports which rule excluded each of the largest
    // entries. It used to collect that detail and print none of it unless
    // `--dry-run` was also given, which made the flag a no-op on a real run.
    explain: raw.explain === true,
    // Retained only so the legacy `--profile cpu` spelling still profiles.
    profiler: profilerType
      ? { type: profilerType, outputDir: raw.profileDir || '.profiles' }
      : null,
  };

  return { request, notices };
}

/**
 * Resolve the secrets policy from the four flags it used to take.
 * @param {Object} raw - Parsed options
 * @returns {'redact'|'fail'|'off'} Policy
 */
function legacySecretsPolicy(raw) {
  if (raw.secretsGuard === false) return 'off';
  if (raw.failOnSecrets === true) return 'fail';
  return 'redact';
}

/**
 * Build the canonical request for a read-only query command.
 *
 * `plan`, `inspect` and `explain` share the copy command's selection and budget
 * vocabulary exactly, because they are answering questions about the same
 * selection. Anything they did differently would make their answers wrong.
 *
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @param {Object} raw - Parsed options
 * @param {Object} context - Parse context
 * @param {Set<string>} context.provided - Option ids actually supplied
 * @param {string} [context.target='.'] - Positional target
 * @param {string} context.operation - Operation name
 * @returns {{request: Object, notices: Notice[]}} Canonical request and notices
 */
export function buildQueryRequest(command, raw, context) {
  const provided = context.provided;
  const notices = deprecationNotices(command, provided);
  validateOptionCombinations(command, provided);

  return {
    request: {
      operation: context.operation,
      target: context.target ?? '.',
      selection: buildSelectionRequest(raw, provided),
      budgets: buildBudgetRequest(raw),
      feedback: buildFeedbackRequest(raw),
      report: {
        format: raw.format ?? null,
        output: raw.output ?? null,
        explain: raw.explain === true,
        all: raw.all === true,
        summary: raw.summary === true,
        depth: raw.depth ?? null,
        allPaths: raw.allPaths === true,
        view: raw.view ?? 'summary',
        reproducible: raw.reproducible === true,
        withoutCopytreeignore: raw.withoutCopytreeignore === true,
        // ignore context
        hints: raw.hints !== false,
        includeCurrentRules: raw.includeCurrentRules === true,
        reference: raw.reference === true,
        // ignore check
        rule: raw.rule ?? null,
        showRemoved: raw.showRemoved === true,
        showKept: raw.showKept === true,
        // ignore init
        template: raw.template ?? 'empty',
        write: raw.write === true,
        force: raw.force === true,
      },
      policy: {
        failEmpty: raw.failEmpty === true,
        failOnTruncation: raw.failOnTruncation === true,
        strict: raw.strict === true,
      },
    },
    notices,
  };
}

/**
 * Raise the policy failure a `--fail-*` flag asked for.
 *
 * @param {string} message - What failed
 * @param {string} policy - The flag that asked for the check
 * @param {Object} [details={}] - Extra facts
 * @returns {never} Always throws
 */
export function policyFailure(message, policy, details = {}) {
  throw new PolicyError(message, policy, details);
}
