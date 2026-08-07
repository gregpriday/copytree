import { PHASES } from '../ui/feedback/messages.js';

/**
 * Stable pipeline stage identifiers.
 *
 * These are part of the public API: `progress.stage` is rendered by consuming
 * applications, so the set of values must be stable and mappable. Adding a stage
 * is additive; renaming one is breaking.
 *
 * @readonly
 * @enum {string}
 */
export const PIPELINE_STAGES = Object.freeze({
  DISCOVER: 'discover',
  ALWAYS_INCLUDE: 'alwaysInclude',
  GIT_FILTER: 'gitFilter',
  FILTER: 'filter',
  SORT: 'sort',
  BUDGET: 'budget',
  LIMIT: 'limit',
  LOAD: 'load',
  SECRETS: 'secrets',
  TRANSFORM: 'transform',
  DEDUPE: 'dedupe',
  CHAR_LIMIT: 'charLimit',
  INSTRUCTIONS: 'instructions',
  FORMAT: 'format',
  UNKNOWN: 'unknown',
});

/**
 * Class name -> stable stage id and human label.
 *
 * Consumers should switch on the id, not the label; the label is a default
 * rendering, not a contract.
 */
const STAGE_INFO = {
  FileDiscoveryStage: [PIPELINE_STAGES.DISCOVER, 'Discovering files'],
  AlwaysIncludeStage: [PIPELINE_STAGES.ALWAYS_INCLUDE, 'Including required files'],
  GitFilterStage: [PIPELINE_STAGES.GIT_FILTER, 'Filtering by git status'],
  ProfileFilterStage: [PIPELINE_STAGES.FILTER, 'Applying filters'],
  SortFilesStage: [PIPELINE_STAGES.SORT, 'Sorting files'],
  BudgetStage: [PIPELINE_STAGES.BUDGET, 'Applying budgets'],
  LimitStage: [PIPELINE_STAGES.LIMIT, 'Applying limits'],
  FileLoadingStage: [PIPELINE_STAGES.LOAD, 'Loading file contents'],
  SecretsGuardStage: [PIPELINE_STAGES.SECRETS, 'Scanning for secrets'],
  TransformStage: [PIPELINE_STAGES.TRANSFORM, 'Transforming files'],
  DeduplicateFilesStage: [PIPELINE_STAGES.DEDUPE, 'Removing duplicates'],
  CharLimitStage: [PIPELINE_STAGES.CHAR_LIMIT, 'Applying character limits'],
  InstructionsStage: [PIPELINE_STAGES.INSTRUCTIONS, 'Processing instructions'],
  OutputFormattingStage: [PIPELINE_STAGES.FORMAT, 'Formatting output'],
  StreamingOutputStage: [PIPELINE_STAGES.FORMAT, 'Streaming output'],
};

/**
 * Map a stage class name to its stable identifier.
 * @param {string} stageName - Stage class name
 * @returns {string} Stable stage id from {@link PIPELINE_STAGES}
 */
export function stageIdFor(stageName) {
  return STAGE_INFO[stageName]?.[0] ?? PIPELINE_STAGES.UNKNOWN;
}

/**
 * Stable stage id -> user-facing phase.
 *
 * The stage ids stay as they are — they are a public contract and each one
 * names a real, separately-failing step. What a person watching a run needs is
 * coarser: sorting, budgeting and limiting are all "deciding which files to
 * include", and announcing them individually flickers through three labels in
 * under a tenth of a second.
 */
const STAGE_PHASES = Object.freeze({
  [PIPELINE_STAGES.DISCOVER]: PHASES.DISCOVER,
  [PIPELINE_STAGES.ALWAYS_INCLUDE]: PHASES.SELECT,
  [PIPELINE_STAGES.GIT_FILTER]: PHASES.SELECT,
  [PIPELINE_STAGES.FILTER]: PHASES.SELECT,
  [PIPELINE_STAGES.SORT]: PHASES.SELECT,
  [PIPELINE_STAGES.BUDGET]: PHASES.SELECT,
  [PIPELINE_STAGES.LIMIT]: PHASES.SELECT,
  [PIPELINE_STAGES.LOAD]: PHASES.LOAD,
  [PIPELINE_STAGES.TRANSFORM]: PHASES.TRANSFORM,
  [PIPELINE_STAGES.DEDUPE]: PHASES.CONTEXT,
  [PIPELINE_STAGES.CHAR_LIMIT]: PHASES.CONTEXT,
  [PIPELINE_STAGES.SECRETS]: PHASES.SECRETS,
  [PIPELINE_STAGES.INSTRUCTIONS]: PHASES.CONTEXT,
  [PIPELINE_STAGES.FORMAT]: PHASES.FORMAT,
  [PIPELINE_STAGES.UNKNOWN]: PHASES.PREPARE,
});

/**
 * Map a stable stage id to the phase a person sees.
 * @param {string} stageId - A {@link PIPELINE_STAGES} value
 * @returns {string} A {@link PHASES} value
 */
export function userPhaseFor(stageId) {
  return STAGE_PHASES[stageId] ?? PHASES.PREPARE;
}

/**
 * Normalizes pipeline events into simple progress updates.
 *
 * Translates detailed pipeline events (stage:start, stage:complete, file:batch,
 * stage:progress) into a simple `{ percent, message, stage }` format for UI
 * consumers.
 *
 * Progress guarantees:
 * - Always starts at 0%
 * - Always ends at 100% exactly once, on success
 * - Monotonically increasing (never goes backward)
 * - `stage` is a stable id from {@link PIPELINE_STAGES}, never a class name
 * - Fires during discovery, not only during formatting: on a large repository
 *   the walk is the long pole, and a bar that sits at 0% then jumps reads as a hang
 * - Throttled to avoid overwhelming UI (default 100ms)
 */
export class ProgressTracker {
  /**
   * @param {Object} options
   * @param {number} options.totalStages - Total number of pipeline stages
   * @param {Function} [options.onProgress] - Progress callback ({ percent, message })
   * @param {number} [options.throttleMs=100] - Minimum ms between emissions
   */
  constructor({ totalStages, onProgress, throttleMs = 100 } = {}) {
    this.totalStages = totalStages || 1;
    this.onProgress = onProgress || (() => {});
    this.throttleMs = throttleMs;

    this.completedStages = 0;
    this.currentStageIndex = -1;
    this.currentStageProgress = 0;
    this.lastPercent = -1;
    this.lastEmitTime = 0;
    this.started = false;
    this.finished = false;
  }

  /**
   * Attach event listeners to a pipeline instance.
   * @param {import('../pipeline/Pipeline.js').default} pipeline
   */
  attach(pipeline) {
    pipeline.on('pipeline:start', () => {
      this._emitForced({ percent: 0, message: 'Starting...', stage: PIPELINE_STAGES.UNKNOWN });
      this.started = true;
    });

    pipeline.on('stage:start', (data) => {
      this.currentStageIndex = data.index;
      this.currentStageProgress = 0;

      const percent = this._calculatePercent();
      this._emit({
        percent,
        message: `${this._formatStageName(data.stage)}...`,
        stage: stageIdFor(data.stage),
      });
    });

    pipeline.on('stage:progress', (data) => {
      this.currentStageProgress = data.progress || 0;

      const percent = this._calculatePercent();
      const message = data.message || `${this._formatStageName(data.stage)}...`;
      this._emit({
        percent,
        message,
        stage: stageIdFor(data.stage),
        // Counts are what the CLI actually renders: "Reading files… 284/612" is
        // a number a reader can trust, where a percentage spread across stages
        // of wildly different cost is monotonic but misleading.
        completed: data.completed,
        total: data.total,
        item: data.item,
      });
    });

    pipeline.on('file:batch', (data) => {
      const percent = this._calculatePercent();
      const message = data.lastFile
        ? `Processing ${data.lastFile}`
        : `Processed ${data.count} files`;
      this._emit({
        percent,
        message,
        stage: stageIdFor(data.stage),
        completed: data.count,
        item: data.lastFile,
      });
    });

    pipeline.on('stage:complete', (data) => {
      this.completedStages = data.index + 1;
      this.currentStageProgress = 0;

      const percent = this._calculatePercent();
      this._emit({
        percent,
        message: `Completed ${this._formatStageName(data.stage)}`,
        stage: stageIdFor(data.stage),
      });
    });

    pipeline.on('pipeline:complete', () => {
      this._emitForced({ percent: 100, message: 'Complete', stage: PIPELINE_STAGES.UNKNOWN });
      this.finished = true;
    });

    pipeline.on('pipeline:error', () => {
      // On error, emit final progress at whatever we reached
      if (!this.finished) {
        const percent = this._calculatePercent();
        this._emitForced({
          percent,
          message: 'Error occurred',
          stage: PIPELINE_STAGES.UNKNOWN,
        });
        this.finished = true;
      }
    });
  }

  /**
   * Calculate current overall progress percentage.
   * @returns {number} Progress 0-99 (100 is only emitted on pipeline:complete)
   * @private
   */
  _calculatePercent() {
    const stagePercent = (this.completedStages / this.totalStages) * 100;
    const withinStagePercent = (this.currentStageProgress / 100 / this.totalStages) * 100;
    return Math.min(Math.round(stagePercent + withinStagePercent), 99);
  }

  /**
   * Format a stage class name into a human-readable message.
   * @param {string} stageName
   * @returns {string}
   * @private
   */
  _formatStageName(stageName) {
    // Convert "FileDiscoveryStage" -> "Discovering files"
    return STAGE_INFO[stageName]?.[1] ?? stageName;
  }

  /**
   * Emit progress if throttle window has passed and percent has increased.
   * @param {{ percent: number, message: string }} progress
   * @private
   */
  _emit(progress) {
    // Enforce monotonic progress
    if (progress.percent <= this.lastPercent) {
      progress = { ...progress, percent: this.lastPercent };
    }

    const now = Date.now();
    if (now - this.lastEmitTime < this.throttleMs) {
      return;
    }

    this.lastPercent = progress.percent;
    this.lastEmitTime = now;
    try {
      this.onProgress({ ...progress, phase: userPhaseFor(progress.stage) });
    } catch {
      // Swallow callback exceptions — progress tracking must not fail the operation
    }
  }

  /**
   * Emit progress unconditionally (bypasses throttle).
   * Used for start (0%) and complete (100%) events.
   * @param {{ percent: number, message: string }} progress
   * @private
   */
  _emitForced(progress) {
    // Enforce monotonic progress
    if (progress.percent < this.lastPercent) {
      progress = { ...progress, percent: this.lastPercent };
    }

    this.lastPercent = progress.percent;
    this.lastEmitTime = Date.now();
    try {
      this.onProgress({ ...progress, phase: userPhaseFor(progress.stage) });
    } catch {
      // Swallow callback exceptions — progress tracking must not fail the operation
    }
  }
}

export default ProgressTracker;
