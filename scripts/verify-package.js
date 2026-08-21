#!/usr/bin/env node
/**
 * Prove the published artifact works, from outside the repository.
 *
 * Every other gate tests the source tree. This one tests the thing users
 * actually receive: it packs the tarball, installs it into an empty project
 * with production dependencies only, and exercises it the way a consumer does —
 * importing the package by name, never by relative path.
 *
 * That distinction is the whole point. A dev dependency imported by runtime
 * code, a file missing from `files`, a subpath that does not resolve, a
 * declaration that does not match the runtime — none of these can be caught by
 * a test that imports `../../src/index.js`, because in the repository the
 * dependency is installed and the file is present. They surface the first time
 * someone runs `npm install copytree`, which is the worst possible moment.
 *
 * Run directly, or through `npm run verify:release`.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Files the package must ship, whatever else changes. */
const REQUIRED_ENTRIES = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
  'package/src/index.js',
  'package/bin/copytree.js',
  'package/types/index.d.ts',
  'package/types/advanced.d.ts',
  'package/src/advanced.js',
];

/** Exports a consumer is entitled to find on the package root. */
const REQUIRED_EXPORTS = [
  'copy',
  'copyStream',
  'scan',
  'format',
  'formatStream',
  'ConfigManager',
  'CopyTreeError',
  'ERROR_CODES',
  'isAbortError',
  'OUTPUT_FORMAT_VERSIONS',
];

let failures = 0;
let workspace = null;

/**
 * Report a check.
 * @param {boolean} ok - Whether it passed
 * @param {string} label - What was checked
 * @param {string} [detail] - Extra context
 */
function check(ok, label, detail = '') {
  if (!ok) failures += 1;
  const mark = ok ? 'ok  ' : 'FAIL';
  process.stdout.write(`${mark} ${label}${detail ? ` — ${detail}` : ''}\n`);
}

/**
 * Run a command, returning its stdout with line endings normalised.
 *
 * The normalisation is not cosmetic. Every caller here reads the output as
 * lines and compares them to literals, and on Windows the child ends each one
 * with CRLF — so `package/package.json\r` did not equal `package/package.json`
 * and the required-entry checks all failed except the last, the one line with
 * no `\r` after it. Worse, the leaked-`CLAUDE.md` check compares with
 * `endsWith`, so on Windows it could never match and reported a pass no matter
 * what the tarball contained.
 *
 * @param {string} command - Executable
 * @param {string[]} args - Arguments
 * @param {Object} [options={}] - Spawn options
 * @returns {string} Trimmed stdout, LF line endings
 */
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
    .replace(/\r\n/g, '\n')
    .trim();
}

/**
 * The npm CLI as an argument list for `node`, never as a bare `npm`.
 *
 * On Windows `npm` is `npm.cmd`, which `execFile` cannot start: without a
 * shell it does not consult `PATHEXT`, so the lookup fails with `ENOENT`, and
 * since the batch-file argument-injection fix Node refuses to spawn a `.cmd`
 * without `shell: true` at all. Turning the shell on is the usual answer and
 * the wrong one here — it re-joins the arguments on spaces, so any path
 * through a directory like `C:\\Users\\Ada Lovelace` breaks apart again.
 *
 * npm is a JavaScript file, so the portable form is to run it with the Node
 * that is already running this script. `npm_execpath` is set by npm itself for
 * every `npm run`; the fallback beside `process.execPath` covers being invoked
 * directly, as the header invites.
 *
 * @param {string[]} args - npm arguments
 * @returns {string[]} `[cliPath, ...args]`, to be passed to `process.execPath`
 */
function npmArgs(args) {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && /\.[cm]?js$/i.test(fromEnv)) return [fromEnv, ...args];

  const beside = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  if (existsSync(beside)) return [beside, ...args];

  // POSIX: `npm` is a real executable on `PATH`, and `execFile` finds it.
  return null;
}

/**
 * Run npm, wherever it lives.
 * @param {string[]} args - npm arguments
 * @param {Object} [options={}] - Spawn options
 * @returns {string} Trimmed stdout
 */
function npm(args, options = {}) {
  const viaNode = npmArgs(args);
  return viaNode ? run(process.execPath, viaNode, options) : run('npm', args, options);
}

/**
 * Run a command, capturing failure instead of throwing.
 * @param {string} command - Executable
 * @param {string[]} args - Arguments
 * @param {Object} [options={}] - Spawn options
 * @returns {{ok: boolean, output: string}} Outcome
 */
function attempt(command, args, options = {}) {
  try {
    return { ok: true, output: run(command, args, options) };
  } catch (error) {
    // Both streams: `tsc` reports diagnostics on stdout, not stderr, so a
    // stderr-only capture reports a failure with no reason attached.
    return {
      ok: false,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message}`.trim(),
    };
  }
}

// Where to leave the verified artifact, when the caller wants it.
//
// The release workflow must publish the exact bytes these checks passed
// against. Packing again afterwards produces a *different* file — same inputs,
// but nothing proves that, and the tested artifact has already been deleted
// with the temporary workspace.
const keepAt = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
  : null;

try {
  workspace = mkdtempSync(path.join(os.tmpdir(), 'copytree-verify-'));
  const consumer = path.join(workspace, 'consumer');
  mkdirSync(consumer);

  // ---- Pack ------------------------------------------------------------
  const packDestination = keepAt ?? workspace;
  const packed = npm(['pack', '--pack-destination', packDestination], { cwd: repoRoot });
  const tarball = path.join(packDestination, packed.split('\n').pop().trim());
  check(Boolean(tarball), 'npm pack produced a tarball', path.basename(tarball));

  const listing = run('tar', ['-tzf', tarball])
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of REQUIRED_ENTRIES) {
    check(listing.includes(entry), `package contains ${entry.replace('package/', '')}`);
  }

  // CLAUDE.md files are internal and must not ship.
  const leaked = listing.filter((entry) => entry.endsWith('CLAUDE.md'));
  check(leaked.length === 0, 'package excludes internal CLAUDE.md files', leaked.join(', '));

  // ---- Install, production dependencies only ---------------------------
  writeFileSync(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'copytree-consumer', version: '1.0.0', private: true, type: 'module' }, null, 2)}\n`,
  );

  const installArgs = [
    'install',
    tarball,
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
  ];
  const viaNode = npmArgs(installArgs);
  const install = viaNode
    ? attempt(process.execPath, viaNode, { cwd: consumer })
    : attempt('npm', installArgs, { cwd: consumer });
  check(install.ok, 'production-only install succeeds', install.ok ? '' : install.output);

  if (!install.ok) throw new Error('install failed; skipping the remaining checks');

  // ---- Import by name --------------------------------------------------
  writeFileSync(
    path.join(consumer, 'consumer.mjs'),
    [
      "import * as copytree from 'copytree';",
      "import * as advanced from 'copytree/advanced';",
      `const required = ${JSON.stringify(REQUIRED_EXPORTS)};`,
      'const missing = required.filter((name) => copytree[name] === undefined);',
      'if (missing.length > 0) {',
      '  console.error(`missing exports: ${missing.join(", ")}`);',
      '  process.exit(1);',
      '}',
      // Exercise a real operation, not just the import: a package can import
      // cleanly and still fail the moment it touches a missing dependency.
      "const result = await copytree.copy(process.cwd(), { format: 'json' });",
      'if (typeof result.output !== "string") { console.error("no output"); process.exit(1); }',
      // The advanced subpath has to resolve too — a declared export map entry
      // that does not resolve is a broken package, not a broken import.
      'for (const name of ["Pipeline", "Stage", "TransformerRegistry", "serialize"]) {',
      '  if (advanced[name] === undefined) { console.error(`advanced missing ${name}`); process.exit(1); }',
      '}',
      'if (!result.outputFormatVersion) { console.error("no format version"); process.exit(1); }',
      'console.log("consumer ok");',
    ].join('\n'),
  );

  const esm = attempt('node', ['consumer.mjs'], { cwd: consumer });
  check(esm.ok && esm.output.includes('consumer ok'), 'ESM consumer imports and runs', esm.output);

  // ---- Type-check a strict TypeScript consumer -------------------------
  writeFileSync(
    path.join(consumer, 'consumer.ts'),
    [
      "import { copy, scan, ConfigManager, ERROR_CODES, isAbortError } from 'copytree';",
      "import { Pipeline, serialize } from 'copytree/advanced';",
      'export async function main(root: string): Promise<number> {',
      '  const config = await ConfigManager.create({ userConfig: false });',
      '  const result = await copy(root, { config, format: "json" });',
      '  for await (const file of scan(root, { config })) { void file.path; }',
      '  void ERROR_CODES;',
      '  void Pipeline;',
      '  void serialize;',
      '  void isAbortError(new Error("x"));',
      '  return result.stats.totalFiles;',
      '}',
    ].join('\n'),
  );
  writeFileSync(
    path.join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'es2022',
          skipLibCheck: false,
          types: [],
        },
        files: ['consumer.ts'],
      },
      null,
      2,
    )}\n`,
  );

  const tsc = attempt(
    'node',
    [path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'],
    {
      cwd: consumer,
    },
  );
  check(tsc.ok, 'strict TypeScript consumer type-checks', tsc.output);

  // ---- CLI smoke tests from the installed package ----------------------
  //
  // The bin entry is run through `process.execPath`, not through the
  // `node_modules/.bin` shim. The shim is npm's artifact and its shape is
  // per-platform — a shell script plus `copytree.cmd` and `copytree.ps1` on
  // Windows — and the extensionless one there is a bash script that
  // `execFile` cannot start. That the shim exists is worth asserting; that it
  // works is npm's contract, not this package's. What this package owes a
  // consumer is a `bin` entry that runs, and that is what is exercised below.
  const installed = path.join(consumer, 'node_modules', 'copytree');
  const binEntry = path.join(
    installed,
    JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8')).bin.copytree,
  );
  const cli = (args, options = {}) => attempt(process.execPath, [binEntry, ...args], options);

  const shim = path.join(consumer, 'node_modules', '.bin', 'copytree');
  check(
    existsSync(shim) || existsSync(`${shim}.cmd`),
    'package installs a copytree command on PATH',
  );

  const declaredVersion = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ).version;

  const version = cli(['--version']);
  check(
    version.ok && version.output.includes(declaredVersion),
    'CLI reports the packaged version',
    version.output,
  );

  const help = cli(['--help']);
  check(
    help.ok && help.output.includes('Commands:'),
    'CLI prints help',
    help.ok ? '' : help.output,
  );

  const plan = cli(['plan', '.'], { cwd: consumer });
  check(plan.ok, 'CLI plans a real directory', plan.ok ? '' : plan.output);

  const copyRun = cli(['.', '--stdout', '--format', 'json'], { cwd: consumer });
  check(copyRun.ok, 'CLI copies to stdout', copyRun.ok ? '' : copyRun.output);

  // An empty selection is a valid outcome, not a failure — including here.
  const emptyDir = path.join(workspace, 'empty');
  mkdirSync(emptyDir);
  const empty = cli([emptyDir, '--stdout'], { cwd: consumer });
  check(empty.ok, 'CLI copies an empty folder successfully', empty.ok ? '' : empty.output);

  const doctor = cli(['doctor', '--format', 'json'], { cwd: consumer });
  check(doctor.ok, 'CLI doctor reports healthy', doctor.ok ? '' : doctor.output);
} catch (error) {
  failures += 1;
  process.stderr.write(`FAIL verification aborted — ${error.message}\n`);
} finally {
  // The tarball survives when `--out` was given: it lives outside the
  // workspace, so removing the workspace does not take it with it.
  if (workspace) rmSync(workspace, { recursive: true, force: true });
}

if (keepAt && failures === 0) {
  process.stdout.write(`Verified artifact left in ${keepAt}\n`);
}

process.stdout.write(
  failures === 0 ? '\nPackage verification passed\n' : `\n${failures} package check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
