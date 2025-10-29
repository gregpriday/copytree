import { env } from '../src/config/ConfigManager.js';

export default {
  // Application metadata
  name: env('APP_NAME', 'CopyTree'),
  version: '0.12.0',
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