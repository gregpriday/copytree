/**
 * One selection engine.
 *
 * Copy, plan, inspect, explain, ignore-check and the SDK all build the same
 * ordered stage list from the same canonical request, and differ only in what
 * they do with the result. Anything else and the preview stops predicting the
 * copy, which is the one thing a preview has to do.
 *
 * Nothing in this module reads file contents. Content loading, transformation,
 * secret scanning and formatting are the copy command's business and are
 * appended after the stages built here.
 */

import path from 'path';
import fs from '../utils/fsx.js';
import { CopyTreeError, ERROR_CODES, ProfileError, ValidationError } from '../utils/errors.js';
import { resolveScope } from '../utils/scopeResolver.js';
import { toPosix } from '../utils/pathUtils.js';
import { buildManifest, classifyOutcome, MANIFEST_OUTCOMES } from '../utils/manifest.js';
import { estimateOutputChars, estimateTokens } from '../utils/estimate.js';
import Pipeline from '../pipeline/Pipeline.js';

/**
 * @typedef {Object} SelectionProfile
 * @property {string} name - Profile name, `default` when none was found
 * @property {string|null} source - Absolute path the profile was read from
 * @property {string[]} include - Profile include globs
 * @property {string[]} exclude - Profile exclusion rules
 * @property {string[]} forceInclude - Profile force-include globs
 * @property {Object} options - Profile-level option overrides
 */

/**
 * Resolve the target root, cloning first when handed a GitHub URL.
 *
 * @param {string} target - Path or GitHub URL
 * @param {Object} [hooks={}] - Optional callbacks
 * @param {Function} [hooks.onClone] - Called with the URL before cloning
 * @param {AbortSignal} [hooks.signal] - Cancels a clone or fetch in progress
 * @returns {Promise<string>} Absolute canonical root
 */
export async function resolveRoot(target, hooks = {}) {
  // Recognising a GitHub URL is a string test; handling one pulls in a handler
  // with its own git, filesystem and child-process machinery.
  if (/^https?:\/\/(?:www\.)?github\.com\//i.test(target)) {
    const { default: GitHubUrlHandler } = await import('../services/GitHubUrlHandler.js');
    if (GitHubUrlHandler.isGitHubUrl(target)) {
      hooks.onClone?.(target);
      // Cloning happens before the pipeline exists, so the pipeline's own
      // cancellation cannot reach it. A repository large enough to be worth
      // cloning is exactly the case where someone reaches for Ctrl+C.
      return new GitHubUrlHandler(target, { signal: hooks.signal }).getFiles();
    }
  }

  const resolved = path.resolve(target);
  if (!(await fs.pathExists(resolved))) {
    throw new CopyTreeError(`Path does not exist: ${resolved}`, ERROR_CODES.PATH_NOT_FOUND, {
      path: target,
    });
  }
  return resolved;
}

/**
 * Resolve a target into the root to traverse and any scope it implies.
 *
 * A file target is permitted and produces a one-file export. It cannot simply
 * become the root — a root is a directory, and traversing a file fails on the
 * first `readdir` — so the containing directory becomes the root and the file
 * becomes a scope entry. That keeps ignore rules and emitted paths anchored the
 * way every other run anchors them.
 *
 * @param {Object} request - Canonical request
 * @param {Object} [hooks={}] - Optional callbacks, forwarded to {@link resolveRoot}
 * @returns {Promise<{root: string, request: Object}>} Root, and a request whose
 *   scopes include the file when one was named
 */
export async function resolveTarget(request, hooks = {}) {
  const resolved = await resolveRoot(request.target, hooks);

  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats || stats.isDirectory()) return { root: resolved, request };

  const root = path.dirname(resolved);
  const relative = toPosix(path.relative(root, resolved));

  return {
    root,
    request: {
      ...request,
      selection: {
        ...request.selection,
        scopes: [...request.selection.scopes, relative],
      },
    },
  };
}

/**
 * Load the file-selection profile for a root.
 *
 * Profiles belong to the project being copied, never to whatever directory the
 * process happens to have been started from: an embedder's cwd is its own app
 * bundle, and a shell user is often a level above the target.
 *
 * @param {string} root - Project root
 * @param {Object} selection - Canonical selection request
 * @param {Object} [hooks={}] - Optional callbacks
 * @param {Function} [hooks.onWarning] - Called when a discovered profile is unusable
 * @returns {Promise<SelectionProfile>} Effective profile
 */
export async function loadSelectionProfile(root, selection, { onWarning } = {}) {
  const empty = {
    name: 'default',
    source: null,
    sources: [],
    include: [],
    exclude: [],
    forceInclude: [],
    options: {},
    transformers: {},
  };

  if (selection.profileDisabled) return empty;

  const { default: FolderProfileLoader } = await import('../config/FolderProfileLoader.js');
  const loader = new FolderProfileLoader({ cwd: root });

  try {
    // Precedence, per section 14.5: packaged defaults < automatic project
    // profile < named project profile. A named profile *overlays* the
    // automatic one rather than replacing it, so a `.copytree.yml` holding the
    // project's shared rules is not silently discarded the moment someone
    // passes `--profile api`.
    // A broken auto-discovered profile is not fatal — a project should still be
    // copyable — but it is not nothing either: the author wrote rules that are
    // not in force, and saying nothing is how they stay that way.
    const discovered = await loader.discover().catch((error) => {
      onWarning?.(`Ignoring ${error.details?.filePath ?? '.copytree.yml'}: ${error.message}`);
      return null;
    });
    const named = selection.profileName ? await loader.loadNamed(selection.profileName) : null;

    if (!discovered && !named) return empty;
    const layers = [discovered, named].filter(Boolean);
    const top = layers.at(-1);

    return {
      name: top.name || selection.profileName || 'default',
      source: top.source || null,
      sources: layers.map((layer) => layer.source).filter(Boolean),
      // A named profile that says nothing about includes inherits the automatic
      // profile's; one that does say something replaces them, because two
      // include lists intersected would select nothing useful.
      include: named?.include?.length ? named.include : (discovered?.include ?? []),
      // Exclusions accumulate: both layers are statements about what to leave
      // out, and neither cancels the other.
      exclude: [...(discovered?.exclude ?? []), ...(named?.exclude ?? [])],
      forceInclude: [...(discovered?.always ?? []), ...(named?.always ?? [])],
      options: { ...(discovered?.options ?? {}), ...(named?.options ?? {}) },
      transformers: { ...(discovered?.transformers ?? {}), ...(named?.transformers ?? {}) },
    };
  } catch (error) {
    // A profile named by hand must exist. A discovered one is optional by
    // definition, so a broken auto-discovered file degrades to no profile.
    if (!selection.profileName) return empty;
    // Only a genuinely missing profile becomes "profile not found". A profile
    // that exists and is malformed keeps its own message, which names the file
    // and the offending field.
    if (error instanceof ProfileError && error.details?.notFound === true) {
      throw new ValidationError(
        `Profile not found: ${selection.profileName}`,
        'profile',
        selection.profileName,
        {
          code: ERROR_CODES.PROFILE_NOT_FOUND,
          profile: selection.profileName,
          searchPath: root,
        },
      );
    }
    throw error;
  }
}

/**
 * Resolve the effective budgets, applying precedence.
 *
 * Packaged defaults < profile options < CLI options. Stated once here rather
 * than at each stage, so `inspect --view budgets` can report the same numbers
 * the run will actually enforce, along with where each came from.
 *
 * @param {Object} request - Canonical request
 * @param {SelectionProfile} profile - Effective profile
 * @param {import('../config/ConfigManager.js').ConfigManager} config - Configuration
 * @returns {Object} Effective budgets with provenance
 */
export function resolveBudgets(request, profile, config) {
  const copytree = config.get('copytree', {});
  const budgets = request.budgets || {};

  const pick = (cliValue, profileValue, defaultValue) => {
    if (cliValue !== null && cliValue !== undefined) return { value: cliValue, source: 'cli' };
    if (profileValue !== undefined && profileValue !== null) {
      return { value: profileValue, source: 'profile' };
    }
    return { value: defaultValue ?? null, source: 'default' };
  };

  return {
    sizeGate: pick(budgets.sizeGate, profile.options.sizeGate, copytree.sizeGate),
    maxTotalSize: pick(budgets.maxTotalSize, profile.options.maxTotalSize, copytree.maxTotalSize),
    maxFiles: pick(budgets.maxFiles, profile.options.maxFileCount, copytree.maxFileCount),
    maxChars: pick(budgets.maxChars, profile.options.charLimit, null),
    // A memory-safety ceiling, not a context budget. No ordinary copy option
    // lifts it, which is why it is reported separately.
    hardFileLimit: { value: copytree.maxFileSize ?? null, source: 'default' },
  };
}

/**
 * Build the ordered stages that decide which files are selected.
 *
 * Everything here works from `stat()` and from ignore, profile and
 * configuration files. Nothing opens a candidate file.
 *
 * @param {Object} params - Build inputs
 * @param {string} params.root - Project root
 * @param {Object} params.request - Canonical request
 * @param {SelectionProfile} params.profile - Effective profile
 * @param {Object} params.budgets - Resolved budgets from {@link resolveBudgets}
 * @param {Object} params.config - Configuration manager
 * @param {Object} [params.retention] - Decision retention policy
 * @returns {Promise<{stages: Array, scopePaths: string[], forceIncludes: string[]}>} Stages
 */
export async function buildSelectionStages({
  root,
  request,
  profile,
  budgets,
  config,
  retention,
  skipCopytreeIgnore = false,
  // `copy` appends its own scanning guard after transformation, where it can
  // see the content it is scanning; the planning guard would be a duplicate.
  secretsPolicy = 'off',
}) {
  const selection = request.selection;
  const stages = [];

  // Scopes are resolved before the pipeline runs. The pipeline continues on
  // stage errors by design, which would turn "that folder does not exist" into
  // an empty result indistinguishable from "everything there is gitignored".
  const scopeEntries =
    selection.scopes.length > 0
      ? await resolveScope(root, selection.scopes, {
          followSymlinks: profile.options.followSymlinks === true,
        })
      : [];
  const scopePaths = scopeEntries.map((entry) => entry.absolutePath);

  const forceIncludes = [...selection.forceIncludes, ...profile.forceInclude];

  const { default: FileDiscoveryStage } = await import('../pipeline/stages/FileDiscoveryStage.js');
  stages.push(
    new FileDiscoveryStage({
      basePath: root,
      // The profile establishes the candidate set; CLI includes narrow it.
      patterns: profile.include.length > 0 ? profile.include : ['**/*'],
      includes: selection.includes,
      profileExcludes: profile.exclude,
      excludes: selection.excludes,
      respectGitignore:
        profile.options.respectGitignore ?? config.get('copytree.respectGitignore', true),
      includeHidden: profile.options.includeHidden ?? config.get('copytree.includeHidden', false),
      followSymlinks:
        profile.options.followSymlinks ?? config.get('copytree.followSymlinks', false),
      maxFileSize: budgets.hardFileLimit.value,
      sizeGate: budgets.sizeGate.value,
      forceInclude: forceIncludes,
      extFilter: selection.extensions.length > 0 ? selection.extensions : null,
      maxDepth: selection.maxDepth,
      scope: scopePaths,
      scopeIgnoresIgnoreFiles: selection.scopeIncludeIgnored,
      scopeIgnoresConfigExcludes: selection.scopeIncludeDefaultExcluded,
      explain: Boolean(retention && retention.mode !== 'counts'),
      decisionRetention: retention,
      skipCopytreeIgnore,
    }),
  );

  // No separate marking stage: discovery marks a force-included file at the
  // moment it decides to include it. A second stage re-deriving the same fact
  // with a different matcher, against a pattern list that never contained the
  // `.copytreeinclude` entries discovery had loaded, got it wrong for exactly
  // the files that most needed the mark.

  // `--git-status` is independent of Git filtering: attaching status to what
  // was already selected is a different request from selecting by status, and
  // the flag used to be silently inert without one of the filter flags.
  if (selection.git || selection.gitStatus) {
    const { default: GitFilterStage } = await import('../pipeline/stages/GitFilterStage.js');
    stages.push(
      new GitFilterStage({
        basePath: root,
        modified: selection.git?.mode === 'modified',
        staged: selection.git?.mode === 'staged',
        changed: selection.git?.mode === 'changed' ? selection.git.ref : null,
        gitStatus: selection.gitStatus,
      }),
    );
  }

  // Sort before budget, always. Budgets truncate from the tail, so "which files
  // survive" is only meaningful once the order is defined.
  const { default: SortFilesStage } = await import('../pipeline/stages/SortFilesStage.js');
  stages.push(new SortFilesStage({ sortBy: selection.sort, order: selection.order }));

  const { default: BudgetStage } = await import('../pipeline/stages/BudgetStage.js');
  stages.push(
    new BudgetStage({
      maxFileCount: budgets.maxFiles.value,
      maxTotalSize: budgets.maxTotalSize.value,
    }),
  );

  // Two of the secrets guard's exclusions are decidable without content: the
  // secret-prone filename list (`.env`, `*.pem`) and the scan size ceiling.
  // Both remove files from the *selection*, so a plan that skipped them would
  // predict a set the copy does not produce — which is the one thing a plan may
  // not do. Run in plan mode, it reads nothing.
  if (secretsPolicy !== 'off') {
    const { default: SecretsGuardStage } = await import('../pipeline/stages/SecretsGuardStage.js');
    stages.push(
      new SecretsGuardStage({
        enabled: true,
        planOnly: true,
        redactionMode: config.get('secretsGuard.redactionMode', 'typed'),
        failOnSecrets: false,
      }),
    );
  }

  return { stages, scopePaths, forceIncludes };
}

/**
 * @typedef {Object} SelectionPlan
 * @property {string} root - Absolute project root
 * @property {SelectionProfile} profile - Effective profile
 * @property {Object} budgets - Effective budgets with provenance
 * @property {Array} selected - Selected file entries, in final order
 * @property {Array} excluded - Retained exclusion decisions
 * @property {Array} ruleSources - Ignore sources in evaluation order
 * @property {Object} stats - Selection statistics
 * @property {Object} exactness - Which parts of the plan are exact
 * @property {Object} scopes - Requested and resolved scope entries
 */

/**
 * Run the selection stages and return a plan.
 *
 * @param {Object} params - Inputs
 * @param {string} params.root - Project root, already resolved
 * @param {Object} params.request - Canonical request
 * @param {Object} params.config - Loaded configuration manager
 * @param {Object} [params.retention] - Decision retention policy
 * @param {Object} [params.pipelineOptions] - Extra pipeline options
 * @param {Function} [params.onProgress] - Progress callback
 * @returns {Promise<SelectionPlan>} The plan
 */
export async function buildSelectionPlan({
  root,
  request,
  config,
  retention = { mode: 'top', limit: 50 },
  pipelineOptions = {},
  onProgress = null,
  skipCopytreeIgnore = false,
  secretsPolicy = null,
  onWarning = null,
}) {
  const profile = await loadSelectionProfile(root, request.selection, { onWarning });
  const budgets = resolveBudgets(request, profile, config);
  const effectiveSecretsPolicy =
    secretsPolicy ??
    (config.get('secretsGuard.enabled', true) ? (request.security?.secrets ?? 'redact') : 'off');
  const { stages, scopePaths } = await buildSelectionStages({
    root,
    request,
    profile,
    budgets,
    config,
    retention,
    skipCopytreeIgnore,
    secretsPolicy: effectiveSecretsPolicy,
  });

  const pipeline = new Pipeline({
    config,
    continueOnError: true,
    emitProgress: Boolean(onProgress),
    quiet: true,
    ...pipelineOptions,
  });
  pipeline.through(stages);

  if (onProgress) {
    const { ProgressTracker } = await import('../utils/ProgressTracker.js');
    new ProgressTracker({ totalStages: stages.length, onProgress }).attach(pipeline);
  }

  const result = await pipeline.process({
    basePath: root,
    profile: { name: profile.name },
    options: {
      // `--no-tests` is read from here by the discovery stage's layer builder.
      tests: request.selection.noTests ? false : true,
      decisionRetention: retention,
    },
  });

  const selected = (result.files || []).filter(Boolean);
  const report = result.exclusionReport;

  const structureOnlyPatterns = config.get('copytree.structureOnlyPatterns', []);
  const binaryExtensions = config.get('copytree.binaryExtensions', {});
  const manifest = buildManifest(selected, { structureOnlyPatterns, binaryExtensions });

  const selectedBytes = selected.reduce((total, file) => total + (file.size || 0), 0);
  const estimatedChars = estimateOutputChars(selected, {
    format: request.content?.format ?? 'xml',
    onlyTree: request.content ? request.content.includeContent === false : false,
    addLineNumbers: request.content?.lineNumbers === true,
  });

  return {
    root,
    profile,
    budgets,
    selected,
    manifest,
    excluded: report?.entries?.() ?? [],
    exclusionReport: report,
    ruleSources: result.ruleSources || [],
    scopes: { requested: request.selection.scopes, resolved: scopePaths },
    stats: {
      candidates: selected.length + (report?.total ?? 0),
      selected: selected.length,
      selectedBytes,
      estimatedOutputChars: estimatedChars,
      estimatedTokens: estimateTokens(estimatedChars),
      excludedByReason: report?.byReason ? { ...report.byReason } : {},
      excludedTotal: report?.total ?? 0,
      truncated: result.stats?.truncated === true,
      truncatedBy: result.stats?.truncatedBy ?? null,
      truncatedCount: result.stats?.truncatedCount ?? 0,
      decisionsTruncated: report?.truncated === true,
      decisionsOmitted: report?.omittedEntries ?? 0,
    },
    // Stated rather than implied. A number that is exact and a number that was
    // guessed from byte counts should never look the same in a report a person
    // is about to make a decision from.
    exactness: {
      pathSelection: 'exact',
      fileCountBudget: 'exact',
      totalSizeBudget: 'exact',
      sizeGate: 'exact',
      characterBudget: request.budgets?.maxChars != null ? 'estimated-from-bytes' : 'not-evaluated',
      deduplication: 'not-evaluated',
      // Path-level secret exclusions are applied here, so the selection is
      // exact. Content-level redaction is not, and cannot be without reading.
      secretExclusion: effectiveSecretsPolicy === 'off' ? 'not-evaluated' : 'exact',
      secretRedaction: 'not-evaluated',
    },
  };
}

export { MANIFEST_OUTCOMES, classifyOutcome };
