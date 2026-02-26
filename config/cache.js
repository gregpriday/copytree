import os from 'os';
import path from 'path';
import { env } from '../src/config/ConfigManager.js';

const cacheDir = env('CACHE_FILE_PATH', path.join(os.homedir(), '.copytree', 'cache'));

export default {
  driver: 'file',
  enabled: env('CACHE_ENABLED', true),
  prefix: env('CACHE_PREFIX', 'copytree_'),
  defaultTtl: env('CACHE_DEFAULT_TTL', 3600),
  file: {
    path: cacheDir,
    extension: env('CACHE_FILE_EXTENSION', '.cache'),
    gcProbability: env('CACHE_FILE_GC_PROBABILITY', 0.01),
    maxAge: env('CACHE_FILE_MAX_AGE', 7 * 24 * 60 * 60 * 1000),
  },
  transformations: {
    enabled: env('CACHE_TRANSFORMATIONS_ENABLED', true),
    ttl: env('CACHE_TRANSFORMATIONS_TTL', 86400),
  },
};
