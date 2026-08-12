/**
 * `copytree help [command...]`.
 *
 * Help is a payload: it goes to stdout, is deterministic, contains no ANSI, and
 * loads nothing beyond the command schema. `--format json` emits the versioned
 * command schema, which is what an agent, a wrapper or a documentation
 * generator should be reading rather than scraping the text.
 */

import { commandByPath, subcommandsOf, COMMAND_GROUPS } from '../cli/schema.js';
import {
  commandSchemaJson,
  renderCommandHelp,
  renderGroupHelp,
  renderRootHelp,
} from '../cli/help.js';
import { json } from '../cli/render/format.js';
import { ERROR_CODES, ValidationError } from '../utils/errors.js';

/**
 * Run the help command.
 * @param {Object} request - Canonical request with `commandPath` and `report`
 * @returns {Promise<{text: string}>} What was printed
 */
export default async function helpCommand(request) {
  const tokens = request.commandPath ?? [];

  if (request.report?.format === 'json') {
    process.stdout.write(json(commandSchemaJson({ includeHidden: request.report.all === true })));
    return { text: null };
  }

  if (tokens.length === 0) {
    process.stdout.write(renderRootHelp());
    return { text: 'root' };
  }

  const command = commandByPath(tokens) ?? commandByPath([tokens.join(' ')]);
  if (command) {
    process.stdout.write(renderCommandHelp(command, { all: request.report?.all === true }));
    return { text: command.id };
  }

  if (COMMAND_GROUPS[tokens[0]] && subcommandsOf(tokens[0]).length > 0) {
    process.stdout.write(renderGroupHelp(tokens[0]));
    return { text: tokens[0] };
  }

  throw new ValidationError(`Unknown command: ${tokens.join(' ')}`, 'command', tokens.join(' '), {
    code: ERROR_CODES.INVALID_OPTION,
    suggestion: "Run 'copytree --help' for the command list",
  });
}
