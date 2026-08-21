/**
 * The configuration an SDK operation runs under when the caller supplies none.
 *
 * The CLI and the SDK want opposite defaults here, and giving them the same one
 * was a defect rather than a simplification.
 *
 * For a command someone types, a personal configuration directory is a feature:
 * it is *their* machine, *their* preferences, and they can see the file.
 *
 * For a library embedded in an application it is none of those things. The
 * context an agent receives would depend on a file outside the project, outside
 * the application's control, invisible in its UI, and different on every
 * machine the application is installed on — so the same inputs produce
 * different CopyTrees for different users and neither they nor the developer
 * can tell why. Worse, the legacy `~/.copytree/*.js` form is JavaScript, and
 * loading it means executing arbitrary code from a home directory inside the
 * host application's process, with the host application's privileges.
 *
 * So an SDK call with no configuration is hermetic: packaged defaults only.
 * An embedder that genuinely wants the user's configuration asks for it by
 * constructing one and passing it:
 *
 * ```js
 * const config = await ConfigManager.create();   // reads user configuration
 * await copy(root, { config });
 * ```
 */

import { ConfigManager } from '../config/ConfigManager.js';
import { ValidationError, ERROR_CODES } from '../utils/errors.js';

/**
 * Resolve the configuration for one SDK operation.
 *
 * @param {Object} [options={}] - Operation options
 * @param {ConfigManager} [options.config] - A configuration the caller supplies
 * @returns {Promise<ConfigManager>} The configuration to run under
 * @throws {ValidationError} If `config` is present but is not a ConfigManager
 */
export async function resolveOperationConfig(options = {}) {
  // `!= null`, not truthiness. `config: false` and `config: 0` are mistakes
  // too, and treating them as "no configuration supplied" silently ran the
  // operation under packaged defaults instead of saying so.
  if (options.config != null) {
    // Checked here rather than discovered later. A plain object reaches the
    // first `config.get(...)` deep inside a stage and throws a bare `TypeError`
    // with no `code` — from a public entry point that promises every rejection
    // carries one, about an option the caller could have been told about before
    // the run started.
    if (typeof options.config.get !== 'function') {
      throw new ValidationError(
        'config must be a ConfigManager instance; build one with ConfigManager.create()',
        'config',
        options.config,
        { code: ERROR_CODES.INVALID_OPTION },
      );
    }

    return options.config;
  }

  return ConfigManager.create({
    // Packaged defaults only: no home directory, no executable user config.
    userConfig: false,
    // Strict, because the alternative is silence. A defaults file that fails to
    // load leaves the instance empty, and an empty configuration means no
    // exclusion lists at all — a run that copies `node_modules` and reports
    // success.
    strict: true,
  });
}

export default resolveOperationConfig;
