/**
 * `copytree debug profile` — CPU and heap profiling of a real copy.
 *
 * Moved out of the copy command because "profile" means a file-selection
 * profile everywhere else in CopyTree, and one word cannot carry both meanings
 * in the same flag list. This is a developer diagnostic and is documented as
 * one.
 */

import { Feedback } from '../cli/io.js';
import copyCommand from './copy.js';

/**
 * Run a copy under the profiler.
 *
 * @param {Object} request - Canonical request, with `profiler` populated
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<Object|undefined>} The copy result
 */
export default async function debugProfileCommand(request, context = {}) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  // Profiling a copy that also writes to a clipboard would measure the
  // clipboard. The profiled run selects, loads, transforms and formats — the
  // work worth measuring — and discards the document.
  const profiled = {
    ...request,
    operation: 'copy',
    destination: { type: 'discard', path: null, reveal: false },
  };

  return copyCommand(profiled, { ...context, notices: [] });
}
