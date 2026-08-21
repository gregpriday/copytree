/**
 * Cache defaults.
 *
 * These were written as `env('CACHE_ENABLED', true)` and so on, which reads as
 * "settable from the environment" and never was: `env()` has returned its
 * default and ignored its key for as long as it has existed. Eight keys in this
 * one file implied an environment interface that does not exist. The literals
 * say what actually happens; the supported environment variables are listed in
 * `docs/reference/configuration.md` and are read where they are used.
 */

import os from 'os';
import path from 'path';

export default {
  driver: 'file',
  enabled: true,
  prefix: 'copytree_',
  defaultTtl: 3600,
  file: {
    path: path.join(os.homedir(), '.copytree', 'cache'),
    extension: '.cache',
    gcProbability: 0.01,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  transformations: {
    enabled: true,
    ttl: 86400,
  },
};
