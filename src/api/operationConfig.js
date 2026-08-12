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

/**
 * Resolve the configuration for one SDK operation.
 *
 * @param {Object} [options={}] - Operation options
 * @param {ConfigManager} [options.config] - A configuration the caller supplies
 * @returns {Promise<ConfigManager>} The configuration to run under
 */
export async function resolveOperationConfig(options = {}) {
  if (options.config) return options.config;

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
