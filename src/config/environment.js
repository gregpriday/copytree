/**
 * The whole of CopyTree's environment-variable interface.
 *
 * There used to be no such thing, and two contradictory impressions of one.
 * `config/app.js` and `config/cache.js` were written as `env('COPYTREE_…',
 * default)` for two dozen keys, which reads as an environment interface and was
 * not — `env()` returned its default and ignored its key for as long as it
 * existed. Meanwhile a handful of subsystems really did read `process.env`
 * directly, listed nowhere. So the settings that looked configurable were not,
 * and the ones that were could not be discovered.
 *
 * The rule this list encodes: **environment variables are operational, never
 * semantic.** They tune where CopyTree keeps its files, how loudly it talks,
 * and how hard it works. Nothing here changes which files are selected, what
 * the output contains, or whether secrets are redacted — those come from
 * arguments, profiles and configuration, all of which are visible in the
 * repository and reviewable in a diff. A colleague reproducing your export
 * should not need your shell to do it.
 *
 * `copytree doctor --format json` reports the effective value of each, so an
 * operational surprise is diagnosable without knowing this file exists.
 */

/**
 * @typedef {Object} EnvironmentVariable
 * @property {string} name - The variable
 * @property {string} description - What it changes
 * @property {boolean} [path] - True when the value is a filesystem path
 */

/** @type {ReadonlyArray<EnvironmentVariable>} */
export const ENVIRONMENT_VARIABLES = Object.freeze([
  {
    name: 'COPYTREE_LOG_LEVEL',
    description: 'Minimum log level: error, warn, info, debug',
  },
  {
    name: 'COPYTREE_LOG_FORMAT',
    description: 'Log rendering: text or json',
  },
  {
    name: 'COPYTREE_DATA_CONFIG_PATH',
    description: 'Directory holding config.yaml, instead of the platform default',
    path: true,
  },
  {
    name: 'COPYTREE_LEGACY_CONFIG_PATH',
    description: 'Directory holding the deprecated executable ~/.copytree configuration',
    path: true,
  },
  {
    name: 'COPYTREE_REFERENCE_PATH',
    description: 'Directory for temporary reference files, instead of the system temp directory',
    path: true,
  },
  {
    name: 'COPYTREE_CLIPBOARD_TIMEOUT_MS',
    description: 'How long to wait for the platform clipboard helper',
  },
  {
    name: 'COPYTREE_DISCOVERY_PARALLEL',
    description: 'Enable parallel directory traversal',
  },
  {
    name: 'COPYTREE_DISCOVERY_CONCURRENCY',
    description: 'Concurrent directory operations during discovery',
  },
  {
    name: 'COPYTREE_DISCOVERY_HIGH_WATER_MARK',
    description: 'Buffered results above which discovery pauses scheduling',
  },
  {
    name: 'COPYTREE_NO_VALIDATE',
    description: 'Skip configuration schema validation',
  },
  {
    name: 'COPYTREE_PERFORMANCE',
    description: 'Sample per-stage memory usage, for profiling',
  },
  {
    name: 'COPYTREE_DEBUG',
    description: 'Print a stack trace alongside a reported failure',
  },
  {
    name: 'COPYTREE_ASCII',
    description: 'Use ASCII glyphs instead of Unicode in terminal output',
  },
  {
    name: 'NO_COLOR',
    description: 'Disable colour in terminal output (a cross-tool convention)',
  },
  {
    name: 'FORCE_COLOR',
    description: 'Force colour on, overriding TTY detection (a cross-tool convention)',
  },
  {
    name: 'NODE_ENV',
    description: 'A value of "test" suppresses deprecation warnings and process exits',
  },
  {
    name: 'XDG_CONFIG_HOME',
    description: 'Base directory for configuration on Linux (a platform convention)',
    path: true,
  },
  {
    name: 'APPDATA',
    description: 'Base directory for configuration on Windows (a platform convention)',
    path: true,
  },
]);

/**
 * Environment CopyTree *observes* rather than accepts.
 *
 * The distinction is who sets it. Everything above is set by a person to change
 * what CopyTree does; these are set by the operating system or the terminal, and
 * CopyTree reads them to work out where it is running. They are not a
 * configuration surface, and setting them to influence CopyTree is not
 * supported — but they are read, so leaving them off a list that claims to be
 * exhaustive would make the list untrue.
 *
 * @type {ReadonlyArray<EnvironmentVariable>}
 */
export const PLATFORM_PROBES = Object.freeze([
  { name: 'DISPLAY', description: 'X11 session, for choosing a clipboard helper' },
  { name: 'WAYLAND_DISPLAY', description: 'Wayland session, for choosing a clipboard helper' },
  {
    name: 'XDG_CURRENT_DESKTOP',
    description: 'Desktop environment, for choosing a clipboard helper',
  },
  { name: 'SHELL', description: 'Login shell, for suggesting a completion install command' },
  { name: 'TERM', description: 'Terminal type, for deciding what can be rendered' },
  { name: 'TERM_PROGRAM', description: 'Terminal application, for Unicode support on Windows' },
  { name: 'WT_SESSION', description: 'Windows Terminal session, for Unicode support' },
  { name: 'ConEmuTask', description: 'ConEmu session, for Unicode support' },
  { name: 'LC_ALL', description: 'Locale override, for deciding whether Unicode is safe' },
  { name: 'LC_CTYPE', description: 'Character-type locale, for deciding whether Unicode is safe' },
  { name: 'LANG', description: 'Locale, for deciding whether Unicode is safe' },
]);

/** Every supported name, for a quick membership test. */
export const ENVIRONMENT_VARIABLE_NAMES = Object.freeze(
  ENVIRONMENT_VARIABLES.map((entry) => entry.name),
);

/**
 * The effective value of each supported variable, for diagnostics.
 *
 * Values, not just names: "COPYTREE_LOG_LEVEL is supported" does not help
 * someone whose run is unexpectedly quiet, and "COPYTREE_LOG_LEVEL=error" ends
 * the question. None of these carry credentials — the list is operational by
 * construction, which is what makes it safe to print.
 *
 * @param {Record<string, string|undefined>} [env=process.env] - Environment to read
 * @returns {Array<{name: string, description: string, value: string|null}>} One row per variable
 */
export function describeEnvironment(env = process.env) {
  // Probes included. `doctor` presents this as the environment CopyTree sees,
  // and omitting the probes made that untrue for exactly the questions probes
  // answer — why the glyphs are ASCII, why the clipboard chose the helper it
  // chose. `kind` keeps the two apart for a reader who cares.
  return [
    ...ENVIRONMENT_VARIABLES.map((entry) => ({ ...entry, kind: 'setting' })),
    ...PLATFORM_PROBES.map((entry) => ({ ...entry, kind: 'probe' })),
  ].map(({ name, description, kind }) => ({
    name,
    description,
    kind,
    value: env[name] ?? null,
  }));
}

export default {
  ENVIRONMENT_VARIABLES,
  ENVIRONMENT_VARIABLE_NAMES,
  PLATFORM_PROBES,
  describeEnvironment,
};
