/**
 * The one declarative command schema.
 *
 * Parser registration, root help, per-command help, the machine-readable
 * command schema, shell completions, conflict validation and the deprecation
 * table are all generated from this file. Nothing about the CLI's shape is
 * written down twice, because every previous attempt to keep two copies in
 * agreement — help text and parser, documentation and implementation — drifted.
 *
 * A note on `flags`: they are Commander syntax, because Commander is the parser
 * and translating a second notation into it would only add a place to be wrong.
 * Everything else here is parser-independent metadata.
 */

/** Schema identifier for `copytree help --format json`. */
export const COMMAND_SCHEMA_VERSION = 'copytree-command-schema@1';

/** Output formats CopyTree can render. */
export const FORMATS = Object.freeze(['xml', 'markdown', 'json', 'ndjson', 'sarif', 'tree']);

/** Accepted `--format` spellings, including the one alias worth keeping. */
export const FORMAT_ALIASES = Object.freeze({ md: 'markdown' });

/** Sort keys, in the order they are offered. */
export const SORT_KEYS = Object.freeze(['path', 'size', 'modified', 'name', 'extension', 'depth']);

/**
 * Binary/document policies for `--binary`.
 *
 * `convert` is deliberately absent. It advertised document conversion that did
 * not exist: no converter was ever registered, so the policy's only effect was
 * to load a PDF's raw bytes and hand them to a transform stage that had nothing
 * to do with them. See `REMOVED_OPTION_VALUES`.
 */
export const BINARY_POLICIES = Object.freeze([
  'default',
  'omit',
  'comment',
  'placeholder',
  'base64',
]);

/**
 * Option values that were removed, and what to use instead.
 *
 * Named rather than merely rejected: "invalid value" sends someone to the help
 * text to look for a spelling mistake they did not make.
 */
export const REMOVED_OPTION_VALUES = Object.freeze({
  binary: {
    convert: {
      replacement: 'placeholder',
      reason:
        'document conversion is not implemented; no converter was ever registered, so `convert` only ever produced a placeholder',
    },
  },
});

/** Secret-handling policies for `--secrets`. */
export const SECRET_POLICIES = Object.freeze(['redact', 'fail', 'off']);

/** Redaction marker styles. */
export const REDACTION_MODES = Object.freeze(['typed', 'generic', 'hash']);

/** Shells `copytree completion` can generate for. */
export const SHELLS = Object.freeze(['bash', 'zsh', 'fish', 'powershell']);

/** Values that used to mean "run a profiler" when passed to `--profile`. */
export const LEGACY_PROFILER_VALUES = Object.freeze(['cpu', 'heap', 'all']);

/**
 * @typedef {Object} OptionSpec
 * @property {string} id - Canonical camelCase key the handler reads
 * @property {string} flags - Commander flag string
 * @property {string} description - One-line help text
 * @property {'string'|'integer'|'size'|'path'|'glob'|'gitignore-pattern'|'enum'|'boolean'} [value]
 * @property {string[]} [enumValues] - Permitted values when `value` is `enum`
 * @property {boolean} [repeatable] - Accepts one value per occurrence, collected into an array
 * @property {unknown} [default] - Default applied by the parser
 * @property {string[]} [conflicts] - Option ids that cannot appear alongside this one
 * @property {string[]} [requires] - Option ids that must appear alongside this one
 * @property {'common'|'advanced'|'hidden'} visibility
 * @property {string} [replacedBy] - Canonical spelling, for deprecated options
 * @property {string} [deprecated] - Migration note shown when the option is used
 * @property {string} [defaultNote] - Default worth stating in help
 */

/**
 * @typedef {Object} OptionGroupSpec
 * @property {string} title - Group heading in command help
 * @property {OptionSpec[]} options - Options in the group
 */

/**
 * @typedef {Object} CommandSpec
 * @property {string} id - Stable identifier, dot-separated for subcommands
 * @property {string[]} path - Command path, e.g. `['ignore', 'check']`
 * @property {string} summary - One line, shown in command lists
 * @property {string} [description] - Longer description for command help
 * @property {boolean} [isDefault] - Runs when no command is named
 * @property {Object[]} [positionals] - Positional arguments
 * @property {OptionGroupSpec[]} [optionGroups] - Grouped options
 * @property {string[]} [examples] - Example invocations, verified by tests
 * @property {string[]} [outputSchemas] - Machine schema identifiers this command can emit
 * @property {string[]} [conflicts] - Human-readable conflict notes for the help footer
 * @property {string[]} [aliases] - Legacy names still accepted by the parser
 * @property {boolean} [hidden] - Omitted from help and completions
 * @property {string} [handler] - Module path, relative to `src/`, loaded on demand
 */

const SELECTION_OPTIONS = {
  title: 'Selection',
  options: [
    {
      id: 'profile',
      flags: '--profile <name>',
      description: 'Use a file-selection profile (.copytree-<name>.yml)',
      value: 'string',
      visibility: 'common',
    },
    {
      id: 'noProfile',
      flags: '--no-profile',
      description: 'Skip automatic project-profile discovery',
      value: 'boolean',
      visibility: 'common',
    },
    {
      id: 'scope',
      flags: '--scope <path>',
      description: 'Traverse only this literal path',
      value: 'path',
      repeatable: true,
      visibility: 'common',
    },
    {
      id: 'include',
      flags: '--include <glob>',
      description: 'Include only matching paths; narrows the profile include set',
      value: 'glob',
      repeatable: true,
      visibility: 'common',
    },
    {
      id: 'exclude',
      flags: '-x, --exclude <pattern>',
      description: 'Add a Git-style exclusion rule',
      value: 'gitignore-pattern',
      repeatable: true,
      visibility: 'common',
    },
    {
      id: 'forceInclude',
      flags: '--force-include <glob>',
      description: 'Override ordinary excludes and the size gate',
      value: 'glob',
      repeatable: true,
      visibility: 'common',
    },
    {
      id: 'ext',
      flags: '--ext <extension>',
      description: 'Keep only this extension (ts or .ts)',
      value: 'string',
      repeatable: true,
      visibility: 'advanced',
    },
    {
      id: 'maxDepth',
      flags: '--max-depth <n>',
      description: 'Limit traversal depth from the project root',
      value: 'integer',
      visibility: 'advanced',
    },
    {
      id: 'tests',
      flags: '--no-tests',
      description: 'Exclude conventional test paths',
      value: 'boolean',
      visibility: 'advanced',
    },
    {
      id: 'modified',
      flags: '-m, --modified',
      description: 'Select working-tree changes',
      value: 'boolean',
      conflicts: ['staged', 'changed'],
      visibility: 'advanced',
    },
    {
      id: 'staged',
      flags: '--staged',
      description: 'Select staged changes',
      value: 'boolean',
      conflicts: ['modified', 'changed'],
      visibility: 'advanced',
    },
    {
      id: 'changed',
      flags: '-c, --changed <ref>',
      description: 'Select files changed since a Git reference',
      value: 'string',
      conflicts: ['modified', 'staged'],
      visibility: 'advanced',
    },
    {
      id: 'dedupe',
      flags: '--dedupe',
      description: 'Remove content-identical files after loading',
      value: 'boolean',
      visibility: 'advanced',
    },
    {
      id: 'scopeIncludeIgnored',
      flags: '--scope-include-ignored',
      description: 'Let --scope entries override the ignore rules that would exclude them',
      value: 'boolean',
      visibility: 'advanced',
    },
    {
      id: 'scopeIncludeDefaultExcluded',
      flags: '--scope-include-default-excluded',
      description: 'Let --scope entries override built-in exclusions (node_modules). .git never',
      value: 'boolean',
      visibility: 'advanced',
    },
  ],
};

/** Selection options, minus the ones that only make sense while copying. */
function selectionOptionsFor(commandId) {
  const dropped = new Set(commandId === 'copy' ? [] : ['dedupe']);
  return {
    title: SELECTION_OPTIONS.title,
    options: SELECTION_OPTIONS.options.filter((option) => !dropped.has(option.id)),
  };
}

const BUDGET_OPTIONS = {
  title: 'Budgets and ordering',
  options: [
    {
      id: 'sizeGate',
      flags: '--size-gate <size>',
      description: 'Per-file gate decided from stat() before opening',
      value: 'size',
      defaultNote: '256KB',
      visibility: 'advanced',
    },
    {
      id: 'noSizeGate',
      flags: '--no-size-gate',
      description: 'Disable the context size gate (not the hard safety ceiling)',
      value: 'boolean',
      visibility: 'advanced',
    },
    {
      id: 'maxTotalSize',
      flags: '--max-total-size <size>',
      description: 'Limit selected file bytes',
      value: 'size',
      visibility: 'common',
    },
    {
      id: 'maxFiles',
      flags: '--max-files <count>',
      description: 'Limit selected file count, applied after sorting',
      value: 'integer',
      visibility: 'common',
    },
    {
      id: 'maxChars',
      flags: '--max-chars <count>',
      description: 'Limit emitted content characters, cut at line boundaries',
      value: 'integer',
      visibility: 'common',
    },
    {
      id: 'retainOversizedFirstFile',
      flags: '--retain-oversized-first-file',
      description: 'Keep a first file that alone exceeds --max-total-size',
      value: 'boolean',
      visibility: 'advanced',
    },
    {
      id: 'sort',
      flags: '--sort <by>',
      description: `Selection order: ${SORT_KEYS.join(', ')}`,
      value: 'enum',
      enumValues: SORT_KEYS,
      defaultNote: 'path',
      visibility: 'advanced',
    },
    {
      id: 'order',
      flags: '--order <direction>',
      description: 'Sort direction: asc or desc',
      value: 'enum',
      enumValues: ['asc', 'desc'],
      defaultNote: 'asc',
      visibility: 'advanced',
    },
  ],
};

const FEEDBACK_OPTIONS = {
  title: 'Feedback',
  options: [
    {
      id: 'quiet',
      flags: '-q, --quiet',
      description: 'Suppress progress and successful completion feedback',
      value: 'boolean',
      conflicts: ['verbose'],
      visibility: 'common',
    },
    {
      id: 'verbose',
      flags: '-v, --verbose',
      description: 'Show selection counts, limits, destination, size and duration',
      value: 'boolean',
      conflicts: ['quiet'],
      visibility: 'common',
    },
    {
      id: 'debug',
      flags: '--debug',
      description: 'Alias for --log-level debug',
      value: 'boolean',
      visibility: 'advanced',
    },
    {
      id: 'logLevel',
      flags: '--log-level <level>',
      description: 'Severity floor: error, warn, info, debug',
      value: 'enum',
      enumValues: ['error', 'warn', 'info', 'debug'],
      defaultNote: 'info',
      visibility: 'advanced',
    },
    {
      id: 'logFormat',
      flags: '--log-format <format>',
      description: 'Feedback rendering: text, or newline-delimited json',
      value: 'enum',
      enumValues: ['text', 'json'],
      defaultNote: 'text',
      visibility: 'advanced',
    },
    {
      id: 'color',
      flags: '--no-color',
      description: 'Disable ANSI colour',
      value: 'boolean',
      visibility: 'advanced',
    },
  ],
};

/**
 * Options accepted only so that an existing command line keeps working.
 *
 * Every entry names its canonical replacement, which is what the deprecation
 * notice and the migration guide are generated from. None of them appear in
 * help or in completions.
 */
const DEPRECATED_COPY_OPTIONS = {
  title: 'Deprecated',
  options: [
    {
      id: 'folderProfile',
      flags: '-p, --folder-profile <name>',
      description: 'Use a file-selection profile',
      value: 'string',
      visibility: 'hidden',
      replacedBy: '--profile',
    },
    {
      id: 'noFolderProfile',
      flags: '--no-folder-profile',
      description: 'Skip automatic profile discovery',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--no-profile',
    },
    {
      id: 'profileDir',
      flags: '--profile-dir <dir>',
      description: 'Performance profile output directory',
      value: 'path',
      visibility: 'hidden',
      replacedBy: 'copytree debug profile --output-dir',
    },
    {
      id: 'filter',
      flags: '-f, --filter <pattern...>',
      description: 'Additional include patterns',
      value: 'glob',
      repeatable: true,
      visibility: 'hidden',
      replacedBy: '--include',
    },
    {
      id: 'display',
      flags: '-i, --display',
      description: 'Write the export to stdout',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--stdout',
    },
    {
      id: 'stream',
      flags: '-S, --stream',
      description: 'Stream the export',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--stdout',
    },
    {
      id: 'dryRun',
      flags: '--dry-run',
      description: 'Preview the selection',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: 'copytree plan',
    },
    {
      id: 'head',
      flags: '-l, --head <n>',
      description: 'Limit to the first N files',
      value: 'integer',
      visibility: 'hidden',
      replacedBy: '--max-files',
    },
    {
      id: 'charLimit',
      flags: '-C, --char-limit <n>',
      description: 'Character budget',
      value: 'integer',
      visibility: 'hidden',
      replacedBy: '--max-chars',
    },
    {
      id: 'includeBinary',
      flags: '--include-binary',
      description: 'Include binary files',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--binary base64',
    },
    {
      id: 'withLineNumbers',
      flags: '--with-line-numbers',
      description: 'Add line numbers to file content',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--line-numbers',
    },
    {
      id: 'onlyTree',
      flags: '-t, --only-tree',
      description: 'Omit file bodies',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--no-content',
    },
    {
      id: 'withGitStatus',
      flags: '--with-git-status',
      description: 'Attach Git status to selected files',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--git-status',
    },
    {
      id: 'asReference',
      flags: '-r, --as-reference',
      description: 'Copy a file reference',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--reference',
    },
    {
      id: 'sortOrder',
      flags: '--sort-order <order>',
      description: 'Sort direction',
      value: 'enum',
      enumValues: ['asc', 'desc'],
      visibility: 'hidden',
      replacedBy: '--order',
    },
    {
      id: 'always',
      flags: '--always <patterns...>',
      description: 'Force-include patterns',
      value: 'glob',
      repeatable: true,
      visibility: 'hidden',
      replacedBy: '--force-include',
    },
    {
      id: 'scopeIncludeConfigExcluded',
      flags: '--scope-include-config-excluded',
      description: 'Let --scope override built-in exclusions',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--scope-include-default-excluded',
    },
    {
      id: 'explain',
      flags: '--explain',
      description: 'Report which rule excluded each file',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: 'copytree plan --explain',
    },
    {
      id: 'secretsGuard',
      flags: '--secrets-guard',
      description: 'Enable secret detection and redaction',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--secrets redact',
    },
    {
      id: 'noSecretsGuard',
      flags: '--no-secrets-guard',
      description: 'Disable secret detection',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--secrets off',
    },
    {
      id: 'secretsRedactMode',
      flags: '--secrets-redact-mode <mode>',
      description: 'Redaction marker style',
      value: 'enum',
      enumValues: REDACTION_MODES,
      visibility: 'hidden',
      replacedBy: '--redaction',
    },
    {
      id: 'failOnSecrets',
      flags: '--fail-on-secrets',
      description: 'Fail when secrets are found',
      value: 'boolean',
      visibility: 'hidden',
      replacedBy: '--secrets fail',
    },
  ],
};

/** Options removed outright, kept only so the error can name a replacement. */
export const REMOVED_COPY_OPTIONS = Object.freeze([
  {
    flags: '--info',
    replacedBy: '--metadata',
    note: 'Optional metadata is included by default; --no-metadata omits it.',
  },
  {
    flags: '--show-size',
    replacedBy: '--metadata',
    note: 'Sizes are part of the optional metadata, included by default.',
  },
  {
    flags: '--min-size <size>',
    replacedBy: null,
    note: 'Filter by size with a plan report, or use --size-gate for the per-file gate.',
  },
  {
    flags: '--max-size <size>',
    replacedBy: '--size-gate',
    note: 'The per-file gate is --size-gate; the whole-run budget is --max-total-size.',
  },
  {
    flags: '--no-cache',
    replacedBy: '--no-transform-cache',
    note: 'Cache control is now scoped to the subsystem it affects.',
  },
  {
    flags: '--no-validate',
    replacedBy: 'copytree config validate',
    note: 'Configuration validation is owned by the config command.',
  },
]);

const COPY_COMMAND = {
  id: 'copy',
  path: ['copy'],
  isDefault: true,
  summary: 'Explicit form of the default copy operation',
  description:
    'Export a project as structured context. With no destination option the export is written to ' +
    'a temporary file and a file reference is copied to the clipboard, so pasting into an agent ' +
    'hands over a file to read rather than inline context.',
  handler: 'commands/copy.js',
  positionals: [
    { name: 'path', required: false, description: 'Directory, file, or GitHub URL', default: '.' },
  ],
  optionGroups: [
    {
      title: 'Destination',
      options: [
        {
          id: 'output',
          flags: '-o, --output <file>',
          description: 'Write the export to a file (- means stdout)',
          value: 'path',
          conflicts: ['stdout', 'clipboard', 'reference'],
          visibility: 'common',
        },
        {
          id: 'stdout',
          flags: '--stdout',
          description: 'Write the export to stdout',
          value: 'boolean',
          conflicts: ['output', 'clipboard', 'reference'],
          visibility: 'common',
        },
        {
          id: 'clipboard',
          flags: '-y, --clipboard',
          description: 'Copy the export text itself, not a file reference',
          value: 'boolean',
          conflicts: ['output', 'stdout', 'reference'],
          visibility: 'common',
        },
        {
          id: 'reference',
          flags: '--reference',
          description: 'Copy a file reference to the clipboard (this is the default)',
          value: 'boolean',
          conflicts: ['output', 'stdout', 'clipboard'],
          visibility: 'common',
        },
        {
          id: 'reveal',
          flags: '--reveal',
          description: 'Reveal the written file in the OS file manager',
          value: 'boolean',
          requires: ['output', 'reference'],
          visibility: 'advanced',
        },
      ],
    },
    {
      title: 'Content',
      options: [
        {
          id: 'format',
          flags: '--format <type>',
          description: `Output format: ${FORMATS.join(', ')}`,
          value: 'enum',
          enumValues: FORMATS,
          defaultNote: 'xml',
          visibility: 'common',
        },
        {
          id: 'content',
          flags: '--no-content',
          description: 'Include structure and metadata, but not file bodies',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'lineNumbers',
          flags: '--line-numbers',
          description: 'Add line numbers to text bodies',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'binary',
          flags: '--binary <policy>',
          description: `Binary/document policy: ${BINARY_POLICIES.join(', ')}`,
          value: 'enum',
          enumValues: BINARY_POLICIES,
          defaultNote: 'default',
          visibility: 'advanced',
        },
        {
          id: 'gitStatus',
          flags: '--git-status',
          description: 'Attach Git status to selected files',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'metadata',
          flags: '--metadata',
          description: 'Include optional rich metadata where the format supports it',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'noMetadata',
          flags: '--no-metadata',
          description: 'Omit optional metadata; required schema metadata is kept',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'instructions',
          flags: '--instructions <name>',
          description: 'Include a named instruction block',
          value: 'string',
          visibility: 'advanced',
        },
        {
          id: 'noInstructions',
          flags: '--no-instructions',
          description: 'Omit instruction blocks',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'reproducible',
          flags: '--reproducible',
          description: 'Omit timestamps and normalise volatile metadata',
          value: 'boolean',
          visibility: 'advanced',
        },
      ],
    },
    selectionOptionsFor('copy'),
    BUDGET_OPTIONS,
    {
      title: 'Security and failure policy',
      options: [
        {
          id: 'secrets',
          flags: '--secrets <policy>',
          description: `Secret policy: ${SECRET_POLICIES.join(', ')}`,
          value: 'enum',
          enumValues: SECRET_POLICIES,
          defaultNote: 'redact',
          visibility: 'advanced',
        },
        {
          id: 'redaction',
          flags: '--redaction <style>',
          description: `Redaction marker style: ${REDACTION_MODES.join(', ')}`,
          value: 'enum',
          enumValues: REDACTION_MODES,
          defaultNote: 'typed',
          visibility: 'advanced',
        },
        {
          id: 'secretsReport',
          flags: '--secrets-report <file>',
          description: 'Write a structured findings report (- for stdout)',
          value: 'path',
          visibility: 'advanced',
        },
        {
          id: 'failEmpty',
          flags: '--fail-empty',
          description: 'Fail when no files are selected',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'failOnTruncation',
          flags: '--fail-on-truncation',
          description: 'Fail when a budget omits or truncates requested content',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'failOnFsErrors',
          flags: '--fail-on-fs-errors',
          description: 'Fail when filesystem work degrades after retries',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'strict',
          flags: '--strict',
          description: 'Enable every applicable policy-failure check',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'noTransformCache',
          flags: '--no-transform-cache',
          description: 'Bypass the transformation cache',
          value: 'boolean',
          visibility: 'advanced',
        },
      ],
    },
    FEEDBACK_OPTIONS,
    DEPRECATED_COPY_OPTIONS,
  ],
  conflicts: [
    'Exactly one destination: --reference, --clipboard, --stdout or --output.',
    'Exactly one Git mode: --modified, --staged or --changed.',
    '--reveal requires --output or --reference.',
    '--quiet and --verbose cannot be combined.',
  ],
  examples: [
    'copytree',
    'copytree src --stdout --format markdown',
    'copytree . --include "**/*.ts" --exclude "docs/" --max-total-size 2MB',
    'copytree . -o context.md',
  ],
  outputSchemas: ['copytree-feedback@1'],
};

const PLAN_COMMAND = {
  id: 'plan',
  path: ['plan'],
  summary: 'Preview selected files without reading contents',
  description:
    'The side-effect-free answer to "what will CopyTree select, in what order, and which budgets ' +
    'will bind". Reads directory entries, file metadata, and the ignore, profile and configuration ' +
    'files needed to decide. Never reads candidate file contents.',
  handler: 'commands/plan.js',
  positionals: [{ name: 'path', required: false, description: 'Project root', default: '.' }],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Plan report format: text, json, ndjson',
          value: 'enum',
          enumValues: ['text', 'json', 'ndjson'],
          defaultNote: 'text',
          visibility: 'common',
        },
        {
          id: 'explain',
          flags: '--explain',
          description: 'Include excluded entries and decision provenance',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'all',
          flags: '--all',
          description: 'Include every candidate entry, not only selected ones',
          value: 'boolean',
          conflicts: ['summary'],
          visibility: 'common',
        },
        {
          id: 'summary',
          flags: '--summary',
          description: 'Emit the summary only',
          value: 'boolean',
          conflicts: ['all'],
          visibility: 'common',
        },
        {
          id: 'output',
          flags: '-o, --output <file>',
          description: 'Save the plan report',
          value: 'path',
          visibility: 'common',
        },
        {
          id: 'failEmpty',
          flags: '--fail-empty',
          description: 'Exit with a policy failure on an empty plan',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'failOnTruncation',
          flags: '--fail-on-truncation',
          description: 'Exit with a policy failure when stat-based budgets omit files',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'reproducible',
          flags: '--reproducible',
          description: 'Omit timestamps so the report can be compared byte for byte',
          value: 'boolean',
          visibility: 'advanced',
        },
      ],
    },
    selectionOptionsFor('plan'),
    BUDGET_OPTIONS,
    FEEDBACK_OPTIONS,
  ],
  conflicts: ['--summary and --all cannot be combined.'],
  examples: ['copytree plan .', 'copytree plan . --explain', 'copytree plan . --format json'],
  outputSchemas: ['copytree-plan@1'],
};

const INSPECT_COMMAND = {
  id: 'inspect',
  path: ['inspect'],
  summary: 'Inspect structure, rules, profile and budgets',
  description:
    'Understand a project and the CopyTree environment. Reads no ordinary file contents; ' +
    'configuration, profile and ignore files are read because they are the subject.',
  handler: 'commands/inspect.js',
  positionals: [{ name: 'path', required: false, description: 'Project root', default: '.' }],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'view',
          flags: '--view <name>',
          description: 'summary, tree, extensions, rules, profile, budgets or all',
          value: 'enum',
          enumValues: ['summary', 'tree', 'extensions', 'rules', 'profile', 'budgets', 'all'],
          defaultNote: 'summary',
          visibility: 'common',
        },
        {
          id: 'depth',
          flags: '--depth <n>',
          description: 'Limit rendered tree depth',
          value: 'integer',
          defaultNote: '4',
          visibility: 'common',
        },
        {
          id: 'allPaths',
          flags: '--all-paths',
          description: 'List all candidate paths rather than aggregates',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, markdown, json',
          value: 'enum',
          enumValues: ['text', 'markdown', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
        {
          id: 'output',
          flags: '-o, --output <file>',
          description: 'Save the report',
          value: 'path',
          visibility: 'common',
        },
        {
          id: 'withoutCopytreeignore',
          flags: '--without-copytreeignore',
          description: 'Show the candidate state before .copytreeignore is applied',
          value: 'boolean',
          visibility: 'advanced',
        },
      ],
    },
    selectionOptionsFor('inspect'),
    FEEDBACK_OPTIONS,
  ],
  examples: [
    'copytree inspect .',
    'copytree inspect . --view rules',
    'copytree inspect . --format json',
  ],
  outputSchemas: ['copytree-inspect@1'],
};

const EXPLAIN_COMMAND = {
  id: 'explain',
  path: ['explain'],
  summary: 'Explain why paths are included or excluded',
  description:
    'A complete decision trace for one or more root-relative paths, naming the rule, its source ' +
    'file and its line wherever a file-based rule decided the outcome.',
  handler: 'commands/explain.js',
  positionals: [
    { name: 'entry', required: true, variadic: true, description: 'Root-relative paths to trace' },
  ],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'root',
          flags: '--root <path>',
          description: 'Project root',
          value: 'path',
          defaultNote: '.',
          visibility: 'common',
        },
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
        {
          id: 'output',
          flags: '-o, --output <file>',
          description: 'Save the report',
          value: 'path',
          visibility: 'advanced',
        },
      ],
    },
    selectionOptionsFor('explain'),
    BUDGET_OPTIONS,
    FEEDBACK_OPTIONS,
  ],
  examples: [
    'copytree explain docs/README.md --root .',
    'copytree explain src/index.ts tests/index.test.ts --root .',
  ],
  outputSchemas: ['copytree-explain@1'],
};

const IGNORE_CONTEXT_COMMAND = {
  id: 'ignore.context',
  path: ['ignore', 'context'],
  summary: 'Build context for authoring .copytreeignore',
  description:
    'A safe, compact, content-free project inventory an agent can use to author .copytreeignore. ' +
    'The candidate baseline deliberately excludes .copytreeignore itself, so the areas you might ' +
    'want to exclude — docs, tests, examples, fixtures — are all visible.',
  handler: 'commands/ignore.js',
  positionals: [{ name: 'path', required: false, description: 'Project root', default: '.' }],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: markdown, text, json',
          value: 'enum',
          enumValues: ['markdown', 'text', 'json'],
          defaultNote: 'markdown',
          visibility: 'common',
        },
        {
          id: 'depth',
          flags: '--depth <n>',
          description: 'Tree expansion depth',
          value: 'integer',
          defaultNote: '4',
          visibility: 'common',
        },
        {
          id: 'allPaths',
          flags: '--all-paths',
          description: 'Include every candidate path',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'scope',
          flags: '--scope <path>',
          description: 'Limit context to a literal subtree',
          value: 'path',
          repeatable: true,
          visibility: 'common',
        },
        {
          id: 'output',
          flags: '-o, --output <file>',
          description: 'Save the report',
          value: 'path',
          conflicts: ['reference'],
          visibility: 'common',
        },
        {
          id: 'reference',
          flags: '--reference',
          description: 'Write a temporary report and copy its file reference',
          value: 'boolean',
          conflicts: ['output'],
          visibility: 'common',
        },
        {
          id: 'includeCurrentRules',
          flags: '--include-current-rules',
          description: 'Include full current .copytreeignore decision detail',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'hints',
          flags: '--no-hints',
          description: 'Disable deterministic role hints',
          value: 'boolean',
          visibility: 'advanced',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree ignore context .', 'copytree ignore context . --format json'],
  outputSchemas: ['copytree-ignore-context@1'],
};

const IGNORE_CHECK_COMMAND = {
  id: 'ignore.check',
  path: ['ignore', 'check'],
  summary: 'Validate ignore rules and show their effect',
  description:
    'Validate .copytreeignore syntax and semantics, then show exactly what it removes. Read-only: ' +
    'the file is never rewritten.',
  handler: 'commands/ignore.js',
  positionals: [{ name: 'path', required: false, description: 'Project root', default: '.' }],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
        {
          id: 'strict',
          flags: '--strict',
          description: 'Treat warnings as a policy failure',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'showRemoved',
          flags: '--show-removed',
          description: 'List every removed path',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'showKept',
          flags: '--show-kept',
          description: 'List every retained path',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'rule',
          flags: '--rule <lineOrPattern>',
          description: 'Focus on one rule, by line number or pattern',
          value: 'string',
          visibility: 'common',
        },
        {
          id: 'output',
          flags: '-o, --output <file>',
          description: 'Save the report',
          value: 'path',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree ignore check .', 'copytree ignore check . --strict'],
  outputSchemas: ['copytree-ignore-check@1'],
};

const IGNORE_INIT_COMMAND = {
  id: 'ignore.init',
  path: ['ignore', 'init'],
  summary: 'Print or write a conservative starter file',
  description:
    'Generate a starting point for .copytreeignore. Prints to stdout by default; writing requires ' +
    '--write, and replacing an existing file additionally requires --force.',
  handler: 'commands/ignore.js',
  positionals: [{ name: 'path', required: false, description: 'Project root', default: '.' }],
  optionGroups: [
    {
      title: 'Template',
      options: [
        {
          id: 'template',
          flags: '--template <name>',
          description: 'empty or source',
          value: 'enum',
          enumValues: ['empty', 'source'],
          defaultNote: 'empty',
          visibility: 'common',
        },
        {
          id: 'write',
          flags: '--write',
          description: 'Write <root>/.copytreeignore',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'force',
          flags: '--force',
          description: 'Permit replacing an existing file',
          value: 'boolean',
          requires: ['write'],
          visibility: 'common',
        },
        {
          id: 'format',
          flags: '--format <type>',
          description: 'gitignore (plain rules) or annotated (with comments)',
          value: 'enum',
          enumValues: ['gitignore', 'annotated'],
          defaultNote: 'annotated',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  conflicts: ['--force requires --write.'],
  examples: ['copytree ignore init .', 'copytree ignore init . --template source --write'],
  outputSchemas: [],
};

const CONFIG_SHOW_COMMAND = {
  id: 'config.show',
  path: ['config', 'show'],
  summary: 'Inspect effective configuration with provenance',
  handler: 'commands/config.js',
  aliases: ['config:inspect'],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'section',
          flags: '--section <name>',
          description: 'Show one section only',
          value: 'string',
          visibility: 'common',
        },
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
        {
          id: 'sources',
          flags: '--sources',
          description: 'Show where each effective value came from',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'showSecrets',
          flags: '--show-secrets',
          description: 'Reveal security-sensitive values; requires a TTY, or --force',
          value: 'boolean',
          visibility: 'advanced',
        },
        {
          id: 'force',
          flags: '--force',
          description: 'Permit --show-secrets when stdout is redirected',
          value: 'boolean',
          visibility: 'advanced',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree config show', 'copytree config show --format json --sources'],
  outputSchemas: ['copytree-config@1'],
};

const CONFIG_VALIDATE_COMMAND = {
  id: 'config.validate',
  path: ['config', 'validate'],
  summary: 'Validate configuration against the schema',
  handler: 'commands/config.js',
  aliases: ['config:validate'],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'strict',
          flags: '--strict',
          description: 'Treat warnings as failures',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree config validate', 'copytree config validate --format json'],
  outputSchemas: ['copytree-config-validation@1'],
};

const CONFIG_MIGRATE_COMMAND = {
  id: 'config.migrate',
  path: ['config', 'migrate'],
  summary: 'Convert legacy ~/.copytree configuration into a data file',
  description:
    'Reads the legacy `~/.copytree/*.{js,json}` configuration and writes the equivalent ' +
    '`config.yaml` in the platform configuration directory. Prints the result by default; ' +
    'writing requires --write. The legacy directory is never modified.',
  handler: 'commands/config.js',
  optionGroups: [
    {
      title: 'Migration',
      options: [
        {
          id: 'write',
          flags: '--write',
          description: 'Write the data configuration file',
          value: 'boolean',
          visibility: 'common',
        },
        {
          id: 'force',
          flags: '--force',
          description: 'Permit replacing an existing data configuration file',
          value: 'boolean',
          requires: ['write'],
          visibility: 'common',
        },
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  conflicts: ['--force requires --write.'],
  examples: ['copytree config migrate', 'copytree config migrate --write'],
  outputSchemas: ['copytree-config-migration@1'],
};

const CACHE_STATUS_COMMAND = {
  id: 'cache.status',
  path: ['cache', 'status'],
  summary: 'Report cache contents and location',
  handler: 'commands/cache.js',
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree cache status'],
  outputSchemas: ['copytree-cache@1'],
};

const CACHE_CATEGORY_OPTIONS = [
  {
    id: 'transformations',
    flags: '--transformations',
    description: 'Only the transformation cache',
    value: 'boolean',
    visibility: 'common',
  },
  {
    id: 'references',
    flags: '--references',
    description: 'Only the temporary reference files (clear needs this explicitly)',
    value: 'boolean',
    visibility: 'common',
  },
];

const CACHE_CLEAR_COMMAND = {
  id: 'cache.clear',
  path: ['cache', 'clear'],
  summary: 'Remove cached entries',
  handler: 'commands/cache.js',
  aliases: ['cache:clear'],
  optionGroups: [
    {
      title: 'Categories',
      options: [
        ...CACHE_CATEGORY_OPTIONS,
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree cache clear', 'copytree cache clear --transformations'],
  outputSchemas: ['copytree-cache@1'],
};

const CACHE_GC_COMMAND = {
  id: 'cache.gc',
  path: ['cache', 'gc'],
  summary: 'Remove expired entries and stale reference files',
  handler: 'commands/cache.js',
  optionGroups: [
    {
      title: 'Categories',
      options: [
        ...CACHE_CATEGORY_OPTIONS,
        {
          id: 'retentionDays',
          flags: '--retention-days <n>',
          description: 'Reference-file retention window',
          value: 'integer',
          defaultNote: '7',
          visibility: 'advanced',
        },
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree cache gc'],
  outputSchemas: ['copytree-cache@1'],
};

const DOCTOR_COMMAND = {
  id: 'doctor',
  path: ['doctor'],
  summary: 'Check CopyTree, clipboard, Git and converters',
  description:
    'Diagnostic only: doctor reports, and repairs nothing. Every check names what it looked at ' +
    'and what to do when it fails.',
  handler: 'commands/doctor.js',
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'format',
          flags: '--format <type>',
          description: 'Report format: text, json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree doctor', 'copytree doctor --format json'],
  outputSchemas: ['copytree-doctor@1'],
};

const COMPLETION_COMMAND = {
  id: 'completion',
  path: ['completion'],
  summary: 'Generate shell completion code',
  description: 'Completions are generated from the same command schema as the parser and the help.',
  handler: 'commands/completion.js',
  positionals: [
    {
      name: 'shell',
      required: true,
      description: SHELLS.join(', '),
      enumValues: SHELLS,
    },
  ],
  optionGroups: [FEEDBACK_OPTIONS],
  examples: [
    'copytree completion zsh',
    'copytree completion bash > /etc/bash_completion.d/copytree',
  ],
  outputSchemas: [],
};

const DEBUG_PROFILE_COMMAND = {
  id: 'debug.profile',
  path: ['debug', 'profile'],
  summary: 'Capture CPU and/or heap profiles',
  description:
    'A developer diagnostic. Performance profiling is deliberately absent from copy help: ' +
    '"profile" everywhere else in CopyTree means a file-selection profile.',
  handler: 'commands/debugProfile.js',
  positionals: [{ name: 'path', required: false, description: 'Project root', default: '.' }],
  optionGroups: [
    {
      title: 'Profiling',
      options: [
        {
          id: 'type',
          flags: '--type <kind>',
          description: 'cpu, heap or all',
          value: 'enum',
          enumValues: ['cpu', 'heap', 'all'],
          defaultNote: 'cpu',
          visibility: 'common',
        },
        {
          id: 'outputDir',
          flags: '--output-dir <dir>',
          description: 'Where to write profiles and the report',
          value: 'path',
          defaultNote: '.profiles',
          visibility: 'common',
        },
      ],
    },
    FEEDBACK_OPTIONS,
  ],
  examples: ['copytree debug profile . --type cpu', 'copytree debug profile . --type all'],
  outputSchemas: [],
};

const HELP_COMMAND = {
  id: 'help',
  path: ['help'],
  // Not listed among the commands in root help: the footer already tells the
  // reader how to reach it, and a "help" row in a help screen is noise.
  rootHelp: false,
  summary: 'Show help for CopyTree or one of its commands',
  handler: 'commands/help.js',
  positionals: [{ name: 'command', required: false, variadic: true, description: 'Command path' }],
  optionGroups: [
    {
      title: 'Report',
      options: [
        {
          id: 'format',
          flags: '--format <type>',
          description: 'text, or the versioned machine-readable command schema as json',
          value: 'enum',
          enumValues: ['text', 'json'],
          defaultNote: 'text',
          visibility: 'common',
        },
        {
          id: 'all',
          flags: '--all',
          description: 'Include advanced options',
          value: 'boolean',
          visibility: 'common',
        },
      ],
    },
  ],
  examples: ['copytree help plan', 'copytree help --format json'],
  outputSchemas: [COMMAND_SCHEMA_VERSION],
};

/** Every command, in the order root help lists them. */
export const COMMANDS = Object.freeze([
  COPY_COMMAND,
  PLAN_COMMAND,
  INSPECT_COMMAND,
  EXPLAIN_COMMAND,
  IGNORE_CONTEXT_COMMAND,
  IGNORE_CHECK_COMMAND,
  IGNORE_INIT_COMMAND,
  CONFIG_SHOW_COMMAND,
  CONFIG_VALIDATE_COMMAND,
  CONFIG_MIGRATE_COMMAND,
  CACHE_STATUS_COMMAND,
  CACHE_CLEAR_COMMAND,
  CACHE_GC_COMMAND,
  DOCTOR_COMMAND,
  COMPLETION_COMMAND,
  DEBUG_PROFILE_COMMAND,
  HELP_COMMAND,
]);

/**
 * Parent command groupings, so `copytree ignore` on its own can list its
 * subcommands instead of failing.
 */
export const COMMAND_GROUPS = Object.freeze({
  ignore: {
    summary: 'Author, validate and start a .copytreeignore',
    // Listed subcommand by subcommand in root help. This is the workflow the
    // CLI is built around, and collapsing it to `ignore context|check|init`
    // would hide the one sequence a new reader most needs to see.
    collapse: false,
  },
  config: { summary: 'Inspect, validate or migrate configuration', collapse: true },
  cache: { summary: 'Inspect or manage caches', collapse: true },
  debug: { summary: 'Developer diagnostics', collapse: false },
});

/**
 * The summary line for a parent token.
 * @param {string} parent - Parent token
 * @returns {string} Summary
 */
export function groupSummary(parent) {
  return COMMAND_GROUPS[parent]?.summary ?? `${parent} subcommands`;
}

/**
 * Every top-level token the parser treats as a command rather than a path.
 *
 * A literal directory that collides with one of these is still copyable, with
 * `copytree ./plan` or `copytree copy plan`.
 *
 * @returns {Set<string>} Reserved first tokens
 */
export function reservedCommandTokens() {
  const tokens = new Set(Object.keys(COMMAND_GROUPS));
  for (const command of COMMANDS) {
    tokens.add(command.path[0]);
    for (const alias of command.aliases || []) tokens.add(alias);
  }
  return tokens;
}

/**
 * Look a command up by its dotted id.
 * @param {string} id - Command id, e.g. `ignore.check`
 * @returns {CommandSpec|undefined} The command
 */
export function commandById(id) {
  return COMMANDS.find((command) => command.id === id);
}

/**
 * Look a command up by the path a user typed.
 * @param {string[]} tokens - Command path tokens
 * @returns {CommandSpec|undefined} The command
 */
export function commandByPath(tokens) {
  const wanted = tokens.join(' ');
  return COMMANDS.find(
    (command) =>
      command.path.join(' ') === wanted || (command.aliases || []).includes(tokens.join('')),
  );
}

/**
 * Subcommands under a parent token.
 * @param {string} parent - Parent token, e.g. `ignore`
 * @returns {CommandSpec[]} Subcommands
 */
export function subcommandsOf(parent) {
  return COMMANDS.filter((command) => command.path.length > 1 && command.path[0] === parent);
}

/**
 * Flatten a command's option groups.
 * @param {CommandSpec} command - Command spec
 * @returns {OptionSpec[]} Every option, in declaration order
 */
export function optionsOf(command) {
  return (command.optionGroups || []).flatMap((group) => group.options);
}

/**
 * The long flag name for an option, without its value placeholder.
 * @param {OptionSpec} option - Option spec
 * @returns {string} e.g. `--max-files`
 */
export function longFlagOf(option) {
  const match = option.flags.match(/--[a-z0-9-]+/i);
  return match ? match[0] : option.flags;
}

/**
 * Every deprecated option across every command, with its replacement.
 * @returns {Array<{command: string, flag: string, replacedBy: string}>} Migration rows
 */
export function deprecationTable() {
  const rows = [];
  for (const command of COMMANDS) {
    for (const option of optionsOf(command)) {
      if (!option.replacedBy) continue;
      rows.push({
        command: command.path.join(' '),
        flag: longFlagOf(option),
        replacedBy: option.replacedBy,
      });
    }
  }
  return rows;
}
