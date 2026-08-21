/**
 * Application-level defaults.
 *
 * Every key here is public: `config/schema.json` is closed, so accepting a key
 * is the deliberate act of making it configurable, and a key CopyTree accepts,
 * validates and then never reads is a promise it does not keep. Twelve used to
 * sit in this file — `defaultCommand`, `interactiveMode`, `chunkSize`,
 * `defaultOutput`, `outputEncoding`, `exitOnError`, and the `name`/`version`/
 * `description`/`env`/`basePath`/`userConfigPath` metadata — with no runtime
 * consumer between them. They are gone rather than implemented: it is far
 * easier to add a working key in 1.1 than to carry a misleading one through all
 * of 1.x.
 *
 * The application version is not configuration. It comes from
 * `src/version.js`, which resolves `package.json` relative to its own module
 * rather than to `process.cwd()` — CopyTree normally runs inside someone else's
 * project, and that project has a `package.json` of its own.
 */

export default {
  // Extra internal logging, independent of the log level.
  debug: false,

  // Parallel filesystem operations during discovery.
  maxConcurrency: 5,

  // Indent JSON and SARIF output.
  prettyPrint: true,

  // Which instructions block to load when one is not named.
  defaultInstructions: 'default',

  // Include stack traces and cause chains in error output.
  verboseErrors: false,
};
