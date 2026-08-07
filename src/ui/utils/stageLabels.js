/**
 * Human-readable labels for pipeline stages.
 *
 * Stage classes are named after what they are (`FileDiscoveryStage`), which is
 * the right name in the code and the wrong one in a progress line — a person
 * watching a run wants to know what is happening, not which class is doing it.
 * This maps each stage to the action it performs.
 */
const STAGE_LABELS = {
  FileDiscoveryStage: 'Discovering files',
  AlwaysIncludeStage: 'Applying always-include rules',
  GitFilterStage: 'Filtering by git status',
  ProfileFilterStage: 'Applying filters',
  SortFilesStage: 'Sorting files',
  BudgetStage: 'Applying size budgets',
  LimitStage: 'Applying file limit',
  FileLoadingStage: 'Reading files',
  TransformStage: 'Transforming files',
  SecretsGuardStage: 'Scanning for secrets',
  DeduplicateFilesStage: 'Removing duplicates',
  CharLimitStage: 'Applying character limit',
  InstructionsStage: 'Loading instructions',
  OutputFormattingStage: 'Formatting output',
  StreamingOutputStage: 'Streaming output',
};

/**
 * Convert a pipeline stage name into a human-readable action phrase.
 *
 * Unknown stages fall back to splitting the PascalCase name and dropping the
 * trailing "Stage", so a stage added later reads as "Doing something" rather
 * than leaking a class name into the UI.
 *
 * @param {string} stage - Stage name, e.g. 'FileDiscoveryStage'
 * @returns {string} Human-readable label, e.g. 'Discovering files'
 */
export const stageLabel = (stage) => {
  if (!stage || typeof stage !== 'string') {
    return stage || '';
  }

  if (STAGE_LABELS[stage]) {
    return STAGE_LABELS[stage];
  }

  const words = stage
    .replace(/Stage$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();

  if (!words) {
    return stage;
  }

  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

export { STAGE_LABELS };
export default stageLabel;
