/**
 * `copytree completion <shell>` — emit shell completion code.
 *
 * The payload goes to stdout so it can be redirected straight into a
 * completions directory or sourced inline; nothing else is written there.
 */

import { generateCompletion } from '../cli/completion.js';
import { SHELLS } from '../cli/schema.js';
import { Feedback } from '../cli/io.js';
import { ERROR_CODES, ValidationError } from '../utils/errors.js';

/**
 * Run the completion command.
 * @param {Object} request - Canonical request with `shell`
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<{shell: string}>} What was generated
 */
export default async function completionCommand(request, context = {}) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const shell = String(request.shell || '').toLowerCase();
  if (!SHELLS.includes(shell)) {
    throw new ValidationError(`Unsupported shell: ${request.shell}`, 'shell', request.shell, {
      code: ERROR_CODES.INVALID_OPTION,
      suggestion: `Choose one of: ${SHELLS.join(', ')}`,
    });
  }

  feedback.detail(`Generated ${shell} completion from the command schema`);
  process.stdout.write(generateCompletion(shell));
  return { shell };
}
