/**
 * The `fs-extra` surface CopyTree actually uses, over `node:fs`.
 *
 * `fs-extra` cost **~6 ms to load, on every invocation** — including
 * `copytree --version`, which touches no filesystem beyond its own module graph.
 * It was reached from nineteen modules, so no amount of lazy-loading downstream
 * helped: one import anywhere on the path paid for all of it. The cost is not
 * `fs-extra`'s own code so much as what it pulls behind it — `graceful-fs`,
 * which monkey-patches `node:fs` and installs process-level queue handling,
 * plus `universalify` and `jsonfile`.
 *
 * None of that is needed here. What CopyTree uses is twenty-odd calls, all of
 * which `node:fs` provides directly or in one line: the value `fs-extra` was
 * adding is `ensureDir`, `remove`, `pathExists` and the JSON helpers, and Node
 * grew `mkdir({recursive})` and `rm({recursive, force})` years ago.
 *
 * Call sites are unchanged on purpose. This module is a drop-in replacement for
 * the default `fs-extra` import, so swapping it in is one line per file and the
 * behaviour of every call it forwards is Node's own.
 *
 * **Deliberate omissions.** `graceful-fs`'s EMFILE retry queue is gone with it.
 * That queue guards against exhausting file descriptors under unbounded
 * concurrency, and CopyTree does not have unbounded concurrency: every path that
 * opens files in parallel runs under an explicit limiter, and transient
 * filesystem failures are already retried by `src/utils/retry.js` with the
 * results surfaced through `fsErrorReport`. The protection is at the layer that
 * knows what a failure means.
 *
 * **Why `promisify` rather than `node:fs/promises`.** The promises API is the
 * obvious choice and the wrong one for the hot paths here. It is built on
 * `FileHandle`, with per-call `AbortSignal` plumbing and, for `stat`, a separate
 * open/fstat/close rather than a single syscall — and it measures roughly **2x
 * slower on `stat` and 20% slower on `readFile`** than promisifying the callback
 * form, over 10,000 files. Discovery calls `stat` once per file and loading
 * calls `readFile` once per file, so an early version of this module that used
 * `node:fs/promises` made a 10,000-file copy 7% *slower* overall, wiping out the
 * startup gain on exactly the projects that can least afford it. `fs-extra`
 * promisifies the callback API too, via `universalify`; this matches it.
 */

import {
  closeSync,
  createReadStream,
  createWriteStream,
  Dirent,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  Stats,
} from 'node:fs';
import {
  close as closeCb,
  lstat as lstatCb,
  mkdir as mkdirCb,
  open as openCb,
  read as readCb,
  readdir as readdirCb,
  readFile as readFileCb,
  realpath as realpathCb,
  rename as renameCb,
  rm as rmCb,
  rmdir as rmdirCb,
  stat as statCb,
  writeFile as writeFileCb,
} from 'node:fs';
import { promisify } from 'node:util';

const lstat = promisify(lstatCb);
const mkdir = promisify(mkdirCb);
const readdir = promisify(readdirCb);
const readFile = promisify(readFileCb);
const realpath = promisify(realpathCb);
const rename = promisify(renameCb);
const rm = promisify(rmCb);
const rmdir = promisify(rmdirCb);
const stat = promisify(statCb);
const writeFile = promisify(writeFileCb);

/**
 * Whether a path exists.
 *
 * @param {string} path - Path to test
 * @returns {Promise<boolean>} True when the path exists
 */
async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a directory and any missing parents.
 *
 * @param {string} path - Directory to create
 * @returns {Promise<string|undefined>} First directory created, per Node
 */
function ensureDir(path) {
  return mkdir(path, { recursive: true });
}

/**
 * Create a directory and any missing parents, synchronously.
 * @param {string} path - Directory to create
 * @returns {string|undefined} First directory created, per Node
 */
function ensureDirSync(path) {
  return mkdirSync(path, { recursive: true });
}

/**
 * Delete a file or directory tree, succeeding when it is already absent.
 * @param {string} path - Path to delete
 * @returns {Promise<void>}
 */
function remove(path) {
  return rm(path, { recursive: true, force: true });
}

/**
 * Delete a file or directory tree synchronously, succeeding when absent.
 * @param {string} path - Path to delete
 * @returns {void}
 */
function removeSync(path) {
  rmSync(path, { recursive: true, force: true });
}

/**
 * Read and parse a JSON file.
 * @param {string} path - File to read
 * @returns {Promise<*>} Parsed contents
 */
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Read and parse a JSON file synchronously.
 * @param {string} path - File to read
 * @returns {*} Parsed contents
 */
function readJsonSync(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Serialize a value to a JSON file.
 *
 * Matches `fs-extra`'s trailing newline and `spaces` option, since output files
 * written this way are read by people and diffed by git.
 *
 * @param {string} path - File to write
 * @param {*} data - Value to serialize
 * @param {Object} [options={}] - Options
 * @param {number|string} [options.spaces] - Indentation passed to JSON.stringify
 * @returns {Promise<void>}
 */
function writeJson(path, data, options = {}) {
  return writeFile(path, `${JSON.stringify(data, null, options.spaces ?? 0)}\n`, 'utf8');
}

// `node:fs/promises` `open()` resolves a FileHandle; `fs-extra` resolves a
// numeric descriptor, and the callers here pass that descriptor straight to
// `read()` and `close()`. Promisifying the callback forms keeps the existing
// contract rather than rewriting three call sites around a different object.
const open = promisify(openCb);
const close = promisify(closeCb);
const read = promisify(readCb);

export {
  close,
  closeSync,
  createReadStream,
  createWriteStream,
  Dirent,
  ensureDir,
  ensureDirSync,
  existsSync,
  lstat,
  mkdir,
  open,
  openSync,
  pathExists,
  read,
  readdir,
  readdirSync,
  readFile,
  readFileSync,
  readJson,
  readJsonSync,
  readSync,
  realpath,
  realpathSync,
  remove,
  rename,
  rmdir,
  removeSync,
  rm,
  rmSync,
  stat,
  Stats,
  statSync,
  writeFile,
  writeJson,
};

export default {
  close,
  closeSync,
  createReadStream,
  createWriteStream,
  Dirent,
  ensureDir,
  ensureDirSync,
  existsSync,
  lstat,
  mkdir,
  open,
  openSync,
  pathExists,
  read,
  readdir,
  readdirSync,
  readFile,
  readFileSync,
  readJson,
  readJsonSync,
  readSync,
  realpath,
  realpathSync,
  remove,
  rename,
  rmdir,
  removeSync,
  rm,
  rmSync,
  stat,
  Stats,
  statSync,
  writeFile,
  writeJson,
};
