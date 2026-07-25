import { env } from '../src/config/ConfigManager.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Read version from CopyTree's own package.json.
//
// Resolved from this module, not from process.cwd(). CopyTree is normally run
// from inside someone else's project, and that project almost always has its
// own package.json — so a cwd-relative lookup reported the *target* project's
// version as CopyTree's, and fell back to a hard-coded string everywhere else.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(moduleDir, '..', 'package.json');

let version = 'unknown';
try {
  version = fs.readJsonSync(packageJsonPath).version;
} catch {
  // A package without a readable package.json is broken in ways a stale
  // hard-coded version would only disguise.
  console.warn(`Could not read version from ${packageJsonPath}`);
}

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