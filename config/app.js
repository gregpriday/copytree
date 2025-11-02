import { env } from '../src/config/ConfigManager.js';
import fs from 'fs-extra';
import path from 'path';

// Read version from package.json
// Note: This assumes config/app.js is always one level deep from project root
// which is true for the CopyTree project structure
let version = '0.13.1'; // Fallback version
try {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = fs.readJsonSync(packageJsonPath);
    version = pkg.version;
  }
} catch (error) {
  // Use fallback version if reading fails
  console.warn('Could not read version from package.json, using fallback');
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