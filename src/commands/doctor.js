/**
 * `copytree doctor` — is this installation going to work?
 *
 * Diagnostic only. Every check names what it looked at, what it found, and
 * what to do when the answer is bad; none of them repair anything, because a
 * command that quietly fixes your environment is a command you cannot reason
 * about afterwards.
 */

import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from '../utils/fsx.js';
import { ConfigManager, defaultDataConfigPath } from '../config/ConfigManager.js';
import { REFERENCE_ROOT } from '../utils/outputDestination.js';
import { Feedback, writePayload } from '../cli/io.js';
import { json } from '../cli/render/format.js';
import { VERSION } from '../version.js';
import { PolicyError } from '../utils/errors.js';
import { describeEnvironment } from '../config/environment.js';

/** Schema identifier for the machine-readable diagnosis. */
export const DOCTOR_SCHEMA = 'copytree-doctor@1';

/** Minimum Node version, matching `engines` in package.json. */
const MINIMUM_NODE = [22, 12, 0];

/**
 * Run the doctor command.
 * @param {Object} request - Canonical request
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<Object>} Doctor model
 */
export default async function doctorCommand(request, context = {}) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const checks = [];
  const add = (name, status, detail, remediation = null) =>
    checks.push({ name, status, detail, ...(remediation ? { remediation } : {}) });

  await checkRuntime(add);
  await checkInstallation(add);
  await checkConfiguration(add);
  await checkWritableDirectories(add);
  await checkClipboard(add);
  await checkGit(add);
  await checkGitleaks(add);
  await checkBinaryHandling(add);
  await checkShellCompletion(add);

  const failures = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;

  const model = {
    schema: DOCTOR_SCHEMA,
    copytreeVersion: VERSION,
    platform: `${process.platform} ${process.arch}`,
    node: process.version,
    healthy: failures === 0,
    failures,
    warnings,
    checks,
    // The whole environment interface, with effective values. An operational
    // surprise — a run that is unexpectedly quiet, a reference file in an
    // unexpected place — is answerable from here without knowing which module
    // reads which variable. Every entry is operational by construction, so
    // none of them carries a credential.
    environment: describeEnvironment(),
  };

  feedback.detail(`Ran ${checks.length} checks on ${model.platform}, Node ${model.node}`);

  const text = request.report.format === 'json' ? json(model) : renderDoctorText(model);
  await writePayload(text, { output: request.report.output });

  if (!model.healthy) {
    throw new PolicyError(`${failures} check${failures === 1 ? '' : 's'} failed`, 'doctor', {
      suggestion: 'Follow the remediation printed beside each failing check',
    });
  }

  return model;
}

/**
 * Check the Node runtime.
 * @param {Function} add - Check recorder
 */
async function checkRuntime(add) {
  const parts = process.versions.node.split('.').map(Number);
  const ok = compareVersions(parts, MINIMUM_NODE) >= 0;
  add(
    'node runtime',
    ok ? 'pass' : 'fail',
    `${process.version} (minimum ${MINIMUM_NODE.join('.')})`,
    ok ? null : `Upgrade Node to ${MINIMUM_NODE.join('.')} or later`,
  );
}

/**
 * Check the package installation.
 * @param {Function} add - Check recorder
 */
async function checkInstallation(add) {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(moduleDir, '../..');
  const configDir = path.join(packageRoot, 'config');
  const present = await fs.pathExists(configDir);

  add(
    'installation',
    present ? 'pass' : 'fail',
    `copytree ${VERSION} at ${packageRoot}`,
    present ? null : 'Reinstall CopyTree; the packaged config directory is missing',
  );
}

/**
 * Check that configuration loads and validates.
 * @param {Function} add - Check recorder
 */
async function checkConfiguration(add) {
  try {
    const config = new ConfigManager({ noValidate: true });
    await config.loadConfiguration();

    add(
      'configuration',
      config.isDefaultsLoaded ? 'pass' : 'fail',
      config.isDefaultsLoaded ? 'packaged defaults loaded' : 'packaged defaults missing',
      config.isDefaultsLoaded ? null : 'Reinstall CopyTree',
    );

    for (const error of config.getLoadErrors()) {
      add(`configuration: ${error.scope}`, 'fail', error.message, 'Fix or remove the file');
    }

    const legacyDir = config.userConfigPath;
    const legacyJs = (await fs.readdir(legacyDir).catch(() => [])).filter((file) =>
      file.endsWith('.js'),
    );
    if (legacyJs.length > 0) {
      add(
        'legacy configuration',
        'warn',
        `${legacyJs.length} executable config file${legacyJs.length === 1 ? '' : 's'} in ${legacyDir}`,
        `Move these settings to ${defaultDataConfigPath()}/config.yaml`,
      );
    }

    try {
      config.setValidationEnabled(true);
      await config.loadSchema();
      config.validateConfig();
      add('configuration schema', 'pass', 'configuration matches the schema');
    } catch (error) {
      add('configuration schema', 'fail', error.message, 'Run copytree config validate for detail');
    }
  } catch (error) {
    add('configuration', 'fail', error.message, 'Run copytree config validate for detail');
  }
}

/**
 * Check that the directories CopyTree writes to are usable.
 * @param {Function} add - Check recorder
 */
async function checkWritableDirectories(add) {
  const targets = [
    ['temporary directory', os.tmpdir()],
    ['reference directory', REFERENCE_ROOT],
    ['cache directory', path.join(os.homedir(), '.copytree', 'cache')],
  ];

  for (const [name, dir] of targets) {
    // Diagnostic only: doctor reports, and creates nothing. Creating the
    // directory it was asked to check would make the check pass by changing
    // the thing it is checking, and would leave state behind on a machine
    // someone ran `doctor` on precisely because they did not trust it.
    if (!(await fs.pathExists(dir))) {
      // The nearest ancestor that exists, not just the immediate parent.
      // `~/.copytree/cache` is absent on a fresh install and so is
      // `~/.copytree`, and probing a directory that does not exist always
      // fails to write — so `copytree doctor` told everyone who ran it
      // straight after `npm install -g copytree` that their installation was
      // broken, and exited 3. A check that cries wolf on a healthy machine is
      // worse than no check, because this one exists to be trusted.
      //
      // What actually has to be true is what `mkdir -p` needs: the deepest
      // existing ancestor is writable.
      const anchor = await nearestExistingAncestor(dir);
      const anchorWritable = await isWritable(anchor);
      add(
        name,
        anchorWritable ? 'pass' : 'fail',
        anchorWritable
          ? `absent, and ${anchor} is writable — it will be created on first use`
          : `absent, and ${anchor} is not writable`,
        anchorWritable ? null : 'Grant write access, or set a writable HOME',
      );
      continue;
    }

    const writable = await isWritable(dir);
    add(
      name,
      writable ? 'pass' : 'fail',
      writable ? `writable: ${dir}` : `not writable: ${dir}`,
      writable ? null : 'Grant write access, or set a writable HOME',
    );
  }
}

/**
 * The deepest ancestor of a path that exists on disk.
 *
 * `mkdir -p` creates every missing level, so the question "can this directory
 * be created" is really "is the deepest thing that already exists writable".
 *
 * @param {string} dir - Directory that does not exist
 * @returns {Promise<string>} Nearest existing ancestor, at worst the filesystem root
 */
async function nearestExistingAncestor(dir) {
  let current = path.dirname(dir);

  // `path.dirname('/')` is `/`, so the root terminates the walk.
  while (!(await fs.pathExists(current))) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return current;
}

/**
 * Whether a directory that already exists can be written to.
 *
 * Probes with a real write, because the permission bits do not tell the whole
 * story on every filesystem, and removes the probe afterwards.
 *
 * @param {string} dir - Directory to test
 * @returns {Promise<boolean>} True when writable
 */
async function isWritable(dir) {
  const probe = path.join(dir, `.copytree-doctor-${process.pid}`);
  try {
    await fs.writeFile(probe, 'ok', 'utf8');
    await fs.remove(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check that a file reference can be placed on the clipboard.
 * @param {Function} add - Check recorder
 */
async function checkClipboard(add) {
  try {
    const { default: clipboard } = await import('../utils/clipboard.js');
    const support = clipboard.supportsFileReference();

    add(
      'clipboard file reference',
      support.supported ? 'pass' : 'warn',
      support.detail,
      support.supported ? null : 'Use --output or --stdout in this environment',
    );
  } catch (error) {
    add('clipboard file reference', 'warn', error.message, 'Use --output or --stdout instead');
  }
}

/**
 * Check Git availability, which several selection options depend on.
 * @param {Function} add - Check recorder
 */
async function checkGit(add) {
  // `GitUtils.isGitRepository()` answers false for a missing binary and for a
  // directory that simply is not a repository, so it cannot distinguish "Git
  // is not installed" — the case this check exists to find. Ask Git directly.
  const { spawnSync } = await import('node:child_process');
  const probe = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 });

  if (probe.error || probe.status !== 0) {
    add(
      'git',
      'warn',
      `not available on PATH: ${probe.error?.message ?? `exit ${probe.status}`}`,
      '--modified, --staged, --changed and --git-status need Git on PATH',
    );
    return;
  }

  const version = (probe.stdout || '').trim();
  try {
    const { default: GitUtils } = await import('../utils/GitUtils.js');
    const isRepo = await new GitUtils(process.cwd()).isGitRepository();
    add(
      'git',
      'pass',
      `${version}; current directory is ${isRepo ? 'a repository' : 'not a repository'}`,
    );
  } catch (error) {
    add('git', 'warn', `${version}, but unusable here: ${error.message}`);
  }
}

/**
 * Check for the optional Gitleaks integration.
 * @param {Function} add - Check recorder
 */
async function checkGitleaks(add) {
  try {
    const { default: GitleaksAdapter } = await import('../services/GitleaksAdapter.js');
    const adapter = new GitleaksAdapter();
    const available =
      typeof adapter.isAvailable === 'function' ? await adapter.isAvailable() : false;
    add(
      'gitleaks (optional)',
      'pass',
      available ? 'available' : 'not installed; the built-in secret scanner is used',
    );
  } catch {
    add('gitleaks (optional)', 'pass', 'not installed; the built-in secret scanner is used');
  }
}

/**
 * Report how binary and document files will actually be represented.
 *
 * This check used to be called "document converters" and reported the number of
 * registered transformers — a number that had nothing to do with the question,
 * and which read as "3 converters available" on an installation that could not
 * convert anything at all. Counting components is not a capability check.
 *
 * What a person running `doctor` wants to know is what will happen to the PDFs
 * and images in their project, so that is what this answers.
 *
 * @param {Function} add - Check recorder
 */
async function checkBinaryHandling(add) {
  try {
    const config = await ConfigManager.create({ noValidate: true });
    const fallback = config.get('copytree.binaryFileAction', 'placeholder');
    const policies = config.get('copytree.binaryPolicy', {}) || {};

    // Grouped by outcome rather than listed per category: twenty lines of
    // `image: comment` is a data dump, not a diagnosis.
    const byPolicy = new Map();
    for (const [category, policy] of Object.entries(policies)) {
      if (!byPolicy.has(policy)) byPolicy.set(policy, []);
      byPolicy.get(policy).push(category);
    }

    const summary = [...byPolicy.entries()]
      .map(([policy, categories]) => `${policy}: ${categories.sort().join(', ')}`)
      .sort()
      .join('; ');

    add(
      'binary and document handling',
      'pass',
      `default ${fallback}${summary ? `; ${summary}` : ''}`,
      // Stated plainly rather than left to be discovered from an empty export.
      'Document conversion is not available in this version; documents are named in the tree with a placeholder body',
    );
  } catch (error) {
    add(
      'binary and document handling',
      'warn',
      `could not resolve the binary policy: ${error.message}`,
      'Run `copytree config validate` to find the configuration problem',
    );
  }
}

/**
 * Check whether shell completion looks installed.
 * @param {Function} add - Check recorder
 */
async function checkShellCompletion(add) {
  const shell = path.basename(process.env.SHELL || '');
  if (!shell) {
    add('shell completion', 'pass', 'no interactive shell detected');
    return;
  }
  add(
    'shell completion',
    'pass',
    `detected ${shell}; install with: copytree completion ${shell === 'fish' ? 'fish' : shell === 'zsh' ? 'zsh' : 'bash'}`,
  );
}

/**
 * Compare two semantic version tuples.
 * @param {number[]} a - Left version
 * @param {number[]} b - Right version
 * @returns {number} Negative, zero or positive
 */
function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Render a diagnosis as text.
 * @param {Object} model - Doctor model
 * @returns {string} Report text
 */
function renderDoctorText(model) {
  const mark = { pass: '[ok]', warn: '[warn]', fail: '[fail]' };
  const lines = [
    `CopyTree ${model.copytreeVersion} on ${model.platform}, Node ${model.node}`,
    '',
    ...model.checks.map((check) => {
      const remediation = check.remediation ? `\n       ${check.remediation}` : '';
      return `${mark[check.status]} ${check.name}: ${check.detail}${remediation}`;
    }),
    // Only the ones actually set. Listing thirteen unset variables on every
    // run buries the checks above them; the full list with its descriptions is
    // in `--format json`, and in the configuration reference.
    ...environmentLines(model.environment),
    '',
    model.healthy
      ? `Healthy${model.warnings > 0 ? ` (${model.warnings} warning${model.warnings === 1 ? '' : 's'})` : ''}`
      : `${model.failures} check${model.failures === 1 ? '' : 's'} failed`,
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * The environment variables that are set, for the text report.
 *
 * @param {Array<{name: string, value: string|null}>} environment - Rows from `describeEnvironment()`
 * @returns {string[]} Lines, or nothing when no variable is set
 */
function environmentLines(environment) {
  const set = (environment || []).filter((entry) => entry.value !== null);
  if (set.length === 0) return [];

  return ['', 'Environment:', ...set.map((entry) => `  ${entry.name}=${entry.value}`)];
}
