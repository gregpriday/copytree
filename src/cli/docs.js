/**
 * The CLI reference document, rendered from the command schema.
 *
 * Documentation drift is not fixed by another manual documentation pass; it is
 * fixed by not writing the same thing twice. `docs/cli/copytree-reference.md`
 * is an artefact of `src/cli/schema.js`, and a test fails when the file on disk
 * no longer matches what this module produces.
 */

import {
  COMMANDS,
  COMMAND_GROUPS,
  deprecationTable,
  REMOVED_COPY_OPTIONS,
  subcommandsOf,
} from './schema.js';

/**
 * Escape a cell so a pipe in a pattern does not break the table.
 * @param {string} text - Cell text
 * @returns {string} Escaped text
 */
function cell(text) {
  return String(text ?? '').replaceAll('|', '\\|');
}

/**
 * Render the option table for one command.
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @returns {string[]} Markdown lines
 */
function optionTables(command) {
  const lines = [];

  for (const group of command.optionGroups || []) {
    const visible = group.options.filter((option) => option.visibility !== 'hidden');
    if (visible.length === 0) continue;

    lines.push(`#### ${group.title}`, '');
    lines.push('| Option | Meaning | Notes |');
    lines.push('|---|---|---|');
    for (const option of visible) {
      const notes = [];
      if (option.visibility === 'advanced') notes.push('advanced');
      if (option.repeatable) notes.push('repeatable');
      if (option.defaultNote) notes.push(`default: \`${option.defaultNote}\``);
      if (option.conflicts?.length) {
        notes.push(`conflicts: ${option.conflicts.map((id) => `\`--${kebab(id)}\``).join(', ')}`);
      }
      if (option.requires?.length) {
        notes.push(`requires: ${option.requires.map((id) => `\`--${kebab(id)}\``).join(' or ')}`);
      }
      lines.push(
        `| \`${cell(option.flags)}\` | ${cell(option.description)} | ${cell(notes.join('; '))} |`,
      );
    }
    lines.push('');
  }

  return lines;
}

/**
 * camelCase option id back to its flag spelling.
 * @param {string} id - Option id
 * @returns {string} kebab-case name
 */
function kebab(id) {
  return id.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

/**
 * Build the whole reference document.
 * @returns {string} Markdown
 */
export function renderReference() {
  const lines = [
    '# CopyTree CLI Reference',
    '',
    '<!--',
    '  Generated from src/cli/schema.js by scripts/generate-cli-docs.js.',
    '  Do not edit by hand: run `node scripts/generate-cli-docs.js` instead.',
    '-->',
    '',
    'CopyTree packages a project as structured context for an AI agent.',
    '',
    '```bash',
    'copytree [path] [options]      # copy, using a file reference by default',
    'copytree <command> [options]',
    '```',
    '',
    'With no destination option the export is written to a temporary file and a file',
    'reference is copied to the clipboard, so pasting into an agent hands over a file',
    'to read rather than inline context.',
    '',
    '## Authoring a `.copytreeignore`',
    '',
    '```bash',
    'copytree ignore context .    # a content-free inventory and the active rules',
    '# create or edit .copytreeignore',
    'copytree ignore check .      # validate the rules and show what they remove',
    'copytree plan .              # preview the exact final export',
    '```',
    '',
    '## Commands',
    '',
    '| Command | Summary |',
    '|---|---|',
  ];

  for (const [parent, summary] of Object.entries(COMMAND_GROUPS)) {
    if (subcommandsOf(parent).length === 0) continue;
    lines.push(`| \`copytree ${parent} <subcommand>\` | ${cell(summary)} |`);
  }
  for (const command of COMMANDS) {
    if (command.hidden) continue;
    lines.push(`| \`copytree ${command.path.join(' ')}\` | ${cell(command.summary)} |`);
  }
  lines.push('');

  for (const command of COMMANDS) {
    if (command.hidden) continue;

    const positionals = (command.positionals || [])
      .map((positional) => {
        const label = positional.variadic ? `${positional.name}...` : positional.name;
        return positional.required ? `<${label}>` : `[${label}]`;
      })
      .join(' ');

    lines.push(`## \`copytree ${command.path.join(' ')}\``, '');
    lines.push(command.summary, '');
    if (command.description) lines.push(command.description, '');

    lines.push('```bash');
    lines.push(
      `copytree ${command.path.join(' ')}${positionals ? ` ${positionals}` : ''} [options]`,
    );
    if (command.isDefault) {
      lines.push(`copytree ${positionals} [options]   # the command name is optional`);
    }
    lines.push('```', '');

    if ((command.positionals || []).length > 0) {
      lines.push('| Argument | Meaning | Default |');
      lines.push('|---|---|---|');
      for (const positional of command.positionals) {
        lines.push(
          `| \`${positional.name}\` | ${cell(positional.description)} | ${positional.default ? `\`${positional.default}\`` : '—'} |`,
        );
      }
      lines.push('');
    }

    lines.push(...optionTables(command));

    if ((command.conflicts || []).length > 0) {
      lines.push('**Conflicts**', '');
      for (const note of command.conflicts) lines.push(`- ${note}`);
      lines.push('');
    }

    if ((command.examples || []).length > 0) {
      lines.push('**Examples**', '', '```bash');
      lines.push(...command.examples);
      lines.push('```', '');
    }

    if ((command.outputSchemas || []).length > 0) {
      lines.push(
        `**Machine output**: ${command.outputSchemas.map((schema) => `\`${schema}\``).join(', ')}`,
        '',
      );
    }
  }

  lines.push('## Migration', '');
  lines.push('Deprecated spellings still parse, and each one names its replacement on stderr.', '');
  lines.push('| Deprecated | Replacement |', '|---|---|');
  for (const row of deprecationTable()) {
    lines.push(`| \`${cell(row.flag)}\` (${row.command}) | \`${cell(row.replacedBy)}\` |`);
  }
  lines.push('');

  lines.push('### Removed', '');
  lines.push('| Removed | Replacement | Why |', '|---|---|---|');
  for (const removed of REMOVED_COPY_OPTIONS) {
    lines.push(
      `| \`${cell(removed.flags)}\` | ${removed.replacedBy ? `\`${cell(removed.replacedBy)}\`` : '—'} | ${cell(removed.note)} |`,
    );
  }
  lines.push('');

  lines.push('## Exit codes', '');
  lines.push('| Code | Meaning |', '|---|---|');
  lines.push('| `0` | Success, including a valid empty selection |');
  lines.push('| `1` | Operational failure: I/O, formatting, Git, converters |');
  lines.push('| `2` | Usage or configuration error |');
  lines.push('| `3` | A requested policy check failed |');
  lines.push('| `130` | Cancelled by SIGINT |');
  lines.push('');

  lines.push(
    'Machine output and JSON feedback carry a stable symbolic code alongside the exit code.',
    '',
  );

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}`;
}
