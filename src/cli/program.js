/**
 * Commander registration, generated from the command schema.
 *
 * Nothing about the CLI's shape is written down twice. The parser, the help,
 * the machine schema, the completions and the deprecation table all come from
 * `schema.js`, so an option cannot appear in help and be rejected by the
 * parser, or be accepted and undocumented.
 */

import { Command, Option } from 'commander';
import { COMMANDS, FORMAT_ALIASES, groupSummary, subcommandsOf } from './schema.js';
import { parserFor } from './parsers.js';
import { renderCommandHelp, renderGroupHelp, renderRootHelp } from './help.js';
import { VERSION } from '../version.js';

/**
 * The command-line word for a command, including its positionals.
 * @param {import('./schema.js').CommandSpec} command - Command spec
 * @returns {string} Commander command string
 */
function commandSignature(command) {
  const name = command.path.at(-1);
  const positionals = (command.positionals || [])
    .map((positional) => {
      const label = positional.variadic ? `${positional.name}...` : positional.name;
      return positional.required ? `<${label}>` : `[${label}]`;
    })
    .join(' ');
  return positionals ? `${name} ${positionals}` : name;
}

/**
 * Register one option on a Commander command.
 * @param {Command} target - Commander command
 * @param {import('./schema.js').OptionSpec} spec - Option spec
 */
function addOption(target, spec) {
  const long = spec.flags.match(/--[a-z0-9-]+/i)?.[0] ?? spec.flags;
  const option = new Option(spec.flags, spec.description);

  // Deprecated spellings still parse; they just do not appear anywhere a reader
  // would take them for a recommendation.
  if (spec.visibility === 'hidden') option.hideHelp();

  const parser = parserFor(spec, long, spec.id === 'format' ? FORMAT_ALIASES : {});
  if (parser) option.argParser(parser);

  target.addOption(option);
}

/**
 * Build the Commander program.
 *
 * @param {Object} [hooks={}] - Dispatch hooks
 * @param {Function} hooks.run - Called with `(commandSpec, {args, options, command})`
 * @returns {Command} Configured program
 */
export function buildProgram(hooks = {}) {
  const program = new Command();

  program
    .name('copytree')
    .description('Package a project as structured context for an AI agent')
    .version(VERSION, '-V, --version', 'Print the CopyTree version')
    // Usage errors are ours to classify, so Commander is stopped from calling
    // process.exit with its own code.
    .exitOverride()
    .allowExcessArguments(false)
    .configureOutput({
      // Commander's diagnostics are feedback, not payload.
      writeOut: (text) => process.stdout.write(text),
      writeErr: (text) => process.stderr.write(text),
    });

  program.helpInformation = () => renderRootHelp();

  /** Parent commands, created on demand and shared by their subcommands. */
  const groups = new Map();

  /**
   * The Commander command a spec should be registered on.
   * @param {import('./schema.js').CommandSpec} spec - Command spec
   * @returns {Command} Parent command
   */
  const parentFor = (spec) => {
    if (spec.path.length === 1) return program;

    const name = spec.path[0];
    if (!groups.has(name)) {
      const group = program.command(name).description(groupSummary(name));
      group.helpInformation = () => renderGroupHelp(name);
      // A bare `copytree ignore` lists what it can do rather than failing.
      group.action(() => {
        process.stdout.write(renderGroupHelp(name));
      });
      groups.set(name, group);
    }
    return groups.get(name);
  };

  for (const spec of COMMANDS) {
    const parent = parentFor(spec);
    const command = parent.command(commandSignature(spec), {
      isDefault: spec.isDefault === true,
      hidden: spec.hidden === true,
    });

    command.description(spec.summary);
    command.helpInformation = () => renderCommandHelp(spec, { all: false });

    for (const option of spec.optionGroups?.flatMap((group) => group.options) ?? []) {
      addOption(command, option);
    }

    // Advanced options are one flag away rather than a documentation lookup.
    command.addOption(new Option('--help-all', 'Show advanced options as well').hideHelp());

    for (const alias of spec.aliases || []) {
      // Legacy colon commands keep working. They are parser aliases only: help
      // and completions have moved on.
      const legacy = program.command(alias, { hidden: true });
      for (const option of spec.optionGroups?.flatMap((group) => group.options) ?? []) {
        addOption(legacy, option);
      }
      legacy.action(async (...actionArgs) => {
        const legacyCommand = actionArgs.at(-1);
        await hooks.run(spec, {
          args: actionArgs.slice(0, -2),
          options: legacyCommand.opts(),
          command: legacyCommand,
          legacyName: alias,
        });
      });
    }

    command.action(async (...actionArgs) => {
      // Commander passes declared positionals, then the options object, then
      // the Command. Reading the Command from the end is stable regardless of
      // how many positionals a command declares.
      const actualCommand = actionArgs.at(-1);
      const args = actionArgs.slice(0, -2);

      if (actualCommand.opts().helpAll) {
        process.stdout.write(renderCommandHelp(spec, { all: true }));
        return;
      }

      await hooks.run(spec, {
        args,
        options: actualCommand.opts(),
        command: actualCommand,
      });
    });
  }

  return program;
}

/**
 * Subcommand names under a parent, for the dispatcher.
 * @param {string} parent - Parent token
 * @returns {string[]} Subcommand names
 */
export function subcommandNames(parent) {
  return subcommandsOf(parent).map((command) => command.path.at(-1));
}
