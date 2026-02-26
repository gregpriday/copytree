/**
 * Normalizes pipeline events into simple progress updates.
 *
 * Translates detailed pipeline events (stage:start, stage:complete, file:batch,
 * stage:progress) into a simple { percent, message } format for UI consumers.
 *
 * Progress guarantees:
 * - Always starts at 0%
 * - Always ends at 100% on success
 * - Monotonically increasing (never goes backward)
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
      this._emitForced({ percent: 0, message: 'Starting...' });
      this.started = true;
    });

    pipeline.on('stage:start', (data) => {
      this.currentStageIndex = data.index;
      this.currentStageProgress = 0;

      const percent = this._calculatePercent();
      this._emit({ percent, message: `${this._formatStageName(data.stage)}...` });
    });

    pipeline.on('stage:progress', (data) => {
      this.currentStageProgress = data.progress || 0;

      const percent = this._calculatePercent();
      const message = data.message || `${this._formatStageName(data.stage)}...`;
      this._emit({ percent, message });
    });

    pipeline.on('file:batch', (data) => {
      const percent = this._calculatePercent();
      const message = data.lastFile
        ? `Processing ${data.lastFile}`
        : `Processed ${data.count} files`;
      this._emit({ percent, message });
    });

    pipeline.on('stage:complete', (data) => {
      this.completedStages = data.index + 1;
      this.currentStageProgress = 0;

      const percent = this._calculatePercent();
      this._emit({
        percent,
        message: `Completed ${this._formatStageName(data.stage)}`,
      });
    });

    pipeline.on('pipeline:complete', () => {
      this._emitForced({ percent: 100, message: 'Complete' });
      this.finished = true;
    });

    pipeline.on('pipeline:error', () => {
      // On error, emit final progress at whatever we reached
      if (!this.finished) {
        const percent = this._calculatePercent();
        this._emitForced({ percent, message: 'Error occurred' });
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
    // Convert "ProfileFilterStage" -> "Filtering by profile"
    const stageMessages = {
      FileDiscoveryStage: 'Discovering files',
      AlwaysIncludeStage: 'Including required files',
      GitFilterStage: 'Filtering by git status',
      ProfileFilterStage: 'Applying filters',
      DeduplicateFilesStage: 'Removing duplicates',
      SortFilesStage: 'Sorting files',
      FileLoadingStage: 'Loading file contents',
      TransformStage: 'Transforming files',
      CharLimitStage: 'Applying character limits',
      SecretsGuardStage: 'Scanning for secrets',
      InstructionsStage: 'Processing instructions',
      LimitStage: 'Applying limits',
      OutputFormattingStage: 'Formatting output',
      StreamingOutputStage: 'Streaming output',
    };

    return stageMessages[stageName] || stageName;
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
      this.onProgress(progress);
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
      this.onProgress(progress);
    } catch {
      // Swallow callback exceptions — progress tracking must not fail the operation
    }
  }
}

export default ProgressTracker;
