import { env } from '../src/config/ConfigManager.js';
import { VERSION as version } from '../src/version.js';

// The version comes from `src/version.js`, which resolves `package.json` from
// its own module location rather than from `process.cwd()` — CopyTree is
// normally run from inside someone else's project, and that project almost
// always has its own `package.json`.
//
// This module used to repeat that read itself, which meant a second open and a
// second JSON parse of the same file on every run, and pulled `fs-extra` into
// the default configuration path purely to perform it.

export default {
  // Application metadata
  name: env('APP_NAME', 'CopyTree'),
  version, // Single source of truth from package.json
  description: 'A Node.js CLI tool that copies directory structures and file contents into structured XML format',
  
  // Environment
  env: env('NODE_ENV', 'development'),
  debug: env('APP_DEBUG', false),
  
  // Paths
  basePath: process.cwd(),
  userConfigPath: env('COPYTREE_CONFIG_PATH', '~/.copytree'),
  
  // CLI settings
  defaultCommand: 'copy',
  interactiveMode: env('COPYTREE_INTERACTIVE', true),
  
  // Performance settings
  maxConcurrency: env('COPYTREE_MAX_CONCURRENCY', 5),
  chunkSize: env('COPYTREE_CHUNK_SIZE', 1024 * 1024), // 1MB chunks for streaming
  
  // Output settings
  defaultOutput: 'clipboard', // clipboard, file, console, stream
  outputEncoding: 'utf8',
  prettyPrint: env('COPYTREE_PRETTY_PRINT', true),
  
  // Instructions settings
  defaultInstructions: env('COPYTREE_DEFAULT_INSTRUCTIONS', 'default'),
  
  // Error handling
  exitOnError: env('COPYTREE_EXIT_ON_ERROR', true),
  verboseErrors: env('COPYTREE_VERBOSE_ERRORS', false),
};