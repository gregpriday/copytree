/**
 * Help rendering, generated from the command schema.
 *
 * Help is static: it loads no configuration, no Ink, no transformers, no Git
 * and no clipboard module. `copytree --help` should cost about as much as
 * printing a string, because that is all it is.
 *
 * The root screen leads with what happens when you pass nothing, and then with
 * the ignore-authoring workflow, because those are the two things a reader —
 * human or agent — needs before any flag matters.
 */

import {
  COMMANDS,
  COMMAND_GROUPS,
  COMMAND_SCHEMA_VERSION,
  commandByPath,
  groupSummary,
  longFlagOf,
  optionsOf,
  subcommandsOf,
} from './schema.js';

/** Ids of the copy options root help is allowed to show. */
const ROOT_COPY_OPTION_IDS = [
  'output',
  'stdout',
  'clipboard',
  'reference',
  'format',
  'profile',
  'scope',
  'include',
  'exclude',
  'content',
  'maxTotalSize',
  'maxFiles',
  'maxChars',
  'quiet',
  'verbose',
];

/**
 * The command rows root help lists, derived from the schema.
 *
 * Previously a hardcoded array, which drifted the moment `config migrate` was
 * added: the schema grew a command and the help screen did not mention it.
 * That is the one failure this whole design exists to prevent, so the list is
 * computed and a contract test asserts every command appears.
 *
 * A group whose subcommands are collapsed shows one row — `cache
 * status|clear|gc`. A group that is not collapsed shows a row per subcommand,
 * because the ignore workflow is the sequence a new reader most needs to see.
 *
 * @returns {Array<[string, string]>} `[invocation, summary]` rows, in schema order
 */
function rootCommandRows() {
  const rows = [];
  const collapsed = new Set();

  for (const command of COMMANDS) {
    if (command.hidden || command.rootHelp === false) continue;

    const [parent] = command.path;
    const group = COMMAND_GROUPS[parent];
    const children = subcommandsOf(parent);

    if (group?.collapse && children.length > 0) {
      if (collapsed.has(parent)) continue;
      collapsed.add(parent);
      rows.push([
        `${parent} ${children.map((child) => child.path.at(-1)).join('|')}`,
        group.summary,
      ]);
      continue;
    }

    rows.push([`${command.path.join(' ')}${positionalSuffix(command)}`, command.summary]);
  }

  return rows;
}

/**
 * The positional placeholders a command takes, as they appear in help.
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @returns {string} e.g. ` [path]`, or an empty string
 */
function positionalSuffix(command) {
  const positionals = (command.positionals || [])
    .map((positional) => {
      const label = positional.variadic ? `${positional.name}...` : positional.name;
      return positional.required ? `<${label}>` : `[${label}]`;
    })
    .join(' ');
  return positionals ? ` ${positionals}` : '';
}

/**
 * Pad a column to a width, without trailing spaces on empty text.
 * @param {string} text - Cell text
 * @param {number} width - Column width
 * @returns {string} Padded text
 */
function pad(text, width) {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/**
 * Format one option row: flags on the left, description and default on the right.
 * @param {import('./schema.js').OptionSpec} option - Option spec
 * @param {number} width - Flag column width
 * @returns {string} Rendered line
 */
function optionLine(option, width) {
  const notes = [];
  if (option.repeatable) notes.push('repeatable');
  if (option.defaultNote) notes.push(`default: ${option.defaultNote}`);
  const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
  return `  ${pad(option.flags, width)}  ${option.description}${suffix}`;
}

/**
 * The widest flag string in a list, so one command's options line up.
 * @param {import('./schema.js').OptionSpec[]} options - Options
 * @returns {number} Column width
 */
function flagWidth(options) {
  return options.reduce((widest, option) => Math.max(widest, option.flags.length), 0);
}

/**
 * The root help screen.
 *
 * @returns {string} Rendered help
 */
export function renderRootHelp() {
  const copy = commandByPath(['copy']);
  const byId = new Map(optionsOf(copy).map((option) => [option.id, option]));
  const rootOptions = ROOT_COPY_OPTION_IDS.map((id) => byId.get(id)).filter(Boolean);
  const optionWidth = flagWidth(rootOptions);
  const commandRows = rootCommandRows();
  const commandWidth = commandRows.reduce((w, [name]) => Math.max(w, name.length), 0);

  const lines = [
    'CopyTree — package a project as structured context for an AI agent',
    '',
    'Usage:',
    '  copytree [path] [options]',
    '  copytree <command> [options]',
    '',
    'Default behaviour:',
    '  copytree [path]',
    '  Exports path (or the current directory), writes a temporary XML file,',
    '  and copies a file reference to the clipboard.',
    '',
    'Create .copytreeignore with an agent:',
    '  copytree ignore context .    Show a content-free inventory and active rules',
    '  copytree ignore check .      Validate the file and show what it removes',
    '  copytree plan .              Preview the exact final export',
    '',
    'Commands:',
    ...commandRows.map(([name, summary]) => `  ${pad(name, commandWidth)}  ${summary}`),
    '',
    'Common copy options:',
    ...rootOptions.map((option) => optionLine(option, optionWidth)),
    '',
    "Run 'copytree <command> --help' for options, or 'copytree copy --help-all' for advanced ones.",
    "Run 'copytree help --format json' for the versioned machine-readable command schema.",
  ];

  return `${lines.join('\n')}\n`;
}

/**
 * Help for one command.
 *
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @param {Object} [options={}] - Rendering options
 * @param {boolean} [options.all=false] - Include advanced options
 * @returns {string} Rendered help
 */
export function renderCommandHelp(command, options = {}) {
  const showAdvanced = options.all === true;
  const name = command.path.join(' ');
  const positionals = (command.positionals || [])
    .map((positional) => {
      const label = positional.variadic ? `${positional.name}...` : positional.name;
      return positional.required ? `<${label}>` : `[${label}]`;
    })
    .join(' ');

  const lines = [
    `copytree ${name}${positionals ? ` ${positionals}` : ''} — ${command.summary}`,
    '',
  ];

  if (command.description) {
    lines.push(...wrap(command.description, 88), '');
  }

  lines.push('Usage:');
  lines.push(`  copytree ${name}${positionals ? ` ${positionals}` : ''} [options]`);
  if (command.isDefault) {
    lines.push(`  copytree ${positionals} [options]        (the command name is optional)`);
  }
  lines.push('');

  if ((command.positionals || []).length > 0) {
    const width = command.positionals.reduce((w, p) => Math.max(w, p.name.length), 0);
    lines.push('Arguments:');
    for (const positional of command.positionals) {
      const suffix = positional.default ? ` (default: ${positional.default})` : '';
      lines.push(`  ${pad(positional.name, width)}  ${positional.description}${suffix}`);
    }
    lines.push('');
  }

  let shown = 0;
  let hiddenAdvanced = 0;
  for (const group of command.optionGroups || []) {
    const visible = group.options.filter((option) => {
      if (option.visibility === 'hidden') return false;
      if (option.visibility === 'advanced' && !showAdvanced) {
        hiddenAdvanced += 1;
        return false;
      }
      return true;
    });
    if (visible.length === 0) continue;
    shown += visible.length;
    const width = flagWidth(visible);
    lines.push(`${group.title}:`);
    lines.push(...visible.map((option) => optionLine(option, width)));
    lines.push('');
  }

  if (shown === 0) {
    lines.push('This command takes no options.', '');
  }

  if (hiddenAdvanced > 0) {
    const flag = command.isDefault ? '--help-all' : '--help --all';
    lines.push(
      `${hiddenAdvanced} advanced option${hiddenAdvanced === 1 ? '' : 's'} hidden. ` +
        `Run 'copytree ${name} ${flag}' to see them.`,
      '',
    );
  }

  if ((command.examples || []).length > 0) {
    lines.push('Examples:');
    lines.push(...command.examples.map((example) => `  ${example}`));
    lines.push('');
  }

  if ((command.conflicts || []).length > 0) {
    lines.push('Conflicts:');
    lines.push(...command.conflicts.map((note) => `  ${note}`));
    lines.push('');
  }

  if ((command.outputSchemas || []).length > 0) {
    lines.push(`Machine output: ${command.outputSchemas.join(', ')}`, '');
  }

  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/**
 * Help for a parent token such as `ignore`, listing its subcommands.
 *
 * @param {string} parent - Parent token
 * @returns {string} Rendered help
 */
export function renderGroupHelp(parent) {
  const children = subcommandsOf(parent);
  const width = children.reduce((w, c) => Math.max(w, c.path.join(' ').length), 0);
  const lines = [
    `copytree ${parent} — ${groupSummary(parent)}`,
    '',
    'Usage:',
    `  copytree ${parent} <subcommand> [options]`,
    '',
    'Subcommands:',
    ...children.map((child) => `  ${pad(child.path.join(' '), width)}  ${child.summary}`),
    '',
    `Run 'copytree ${parent} <subcommand> --help' for details.`,
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * The versioned machine-readable command schema.
 *
 * Consumed by agents, wrappers, documentation generation and shell completion,
 * so it carries everything those need and nothing that would make it unstable:
 * no runtime state, no configuration, no absolute paths.
 *
 * @param {Object} [options={}] - Serialization options
 * @param {boolean} [options.includeHidden=false] - Include deprecated options
 * @returns {Object} Serializable command schema
 */
export function commandSchemaJson(options = {}) {
  const includeHidden = options.includeHidden === true;

  return {
    schema: COMMAND_SCHEMA_VERSION,
    commands: COMMANDS.filter((command) => !command.hidden).map((command) => ({
      id: command.id,
      path: command.path,
      summary: command.summary,
      ...(command.description ? { description: command.description } : {}),
      isDefault: command.isDefault === true,
      positionals: (command.positionals || []).map((positional) => ({
        name: positional.name,
        required: positional.required === true,
        variadic: positional.variadic === true,
        description: positional.description,
        ...(positional.default !== undefined ? { default: positional.default } : {}),
        ...(positional.enumValues ? { enumValues: positional.enumValues } : {}),
      })),
      optionGroups: (command.optionGroups || [])
        .map((group) => ({
          title: group.title,
          options: group.options
            .filter((option) => includeHidden || option.visibility !== 'hidden')
            .map(serializeOption),
        }))
        .filter((group) => group.options.length > 0),
      examples: command.examples || [],
      outputSchemas: command.outputSchemas || [],
      conflicts: command.conflicts || [],
      aliases: command.aliases || [],
    })),
  };
}

/**
 * Serialize one option for the machine schema.
 * @param {import('./schema.js').OptionSpec} option - Option spec
 * @returns {Object} Serializable option
 */
function serializeOption(option) {
  return {
    id: option.id,
    flags: option.flags,
    long: longFlagOf(option),
    description: option.description,
    ...(option.value ? { value: option.value } : {}),
    ...(option.enumValues ? { enumValues: option.enumValues } : {}),
    repeatable: option.repeatable === true,
    ...(option.defaultNote !== undefined ? { default: option.defaultNote } : {}),
    ...(option.conflicts ? { conflicts: option.conflicts } : {}),
    ...(option.requires ? { requires: option.requires } : {}),
    ...(option.replacedBy ? { replacedBy: option.replacedBy } : {}),
    visibility: option.visibility,
  };
}

/**
 * Wrap prose to a column, preserving word boundaries.
 * @param {string} text - Text to wrap
 * @param {number} width - Column width
 * @returns {string[]} Wrapped lines
 */
function wrap(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line === '') {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
