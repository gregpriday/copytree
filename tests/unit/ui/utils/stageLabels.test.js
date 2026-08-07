import { stageLabel, STAGE_LABELS } from '../../../../src/ui/utils/stageLabels.js';

describe('stageLabel', () => {
  it('maps known pipeline stages to an action phrase', () => {
    expect(stageLabel('FileDiscoveryStage')).toBe('Discovering files');
    expect(stageLabel('FileLoadingStage')).toBe('Reading files');
    expect(stageLabel('SecretsGuardStage')).toBe('Scanning for secrets');
    expect(stageLabel('OutputFormattingStage')).toBe('Formatting output');
  });

  it('covers every stage in the pipeline directory', () => {
    // Guards against a stage being added without a label.
    const expected = [
      'AlwaysIncludeStage',
      'BudgetStage',
      'CharLimitStage',
      'DeduplicateFilesStage',
      'FileDiscoveryStage',
      'FileLoadingStage',
      'GitFilterStage',
      'InstructionsStage',
      'LimitStage',
      'OutputFormattingStage',
      'ProfileFilterStage',
      'SecretsGuardStage',
      'SortFilesStage',
      'StreamingOutputStage',
      'TransformStage',
    ];
    expect(Object.keys(STAGE_LABELS).sort()).toEqual(expected);
  });

  it('never leaks a PascalCase class name for an unknown stage', () => {
    expect(stageLabel('SomeFutureStage')).toBe('Some future');
    expect(stageLabel('WidgetPolishingStage')).toBe('Widget polishing');
  });

  it('returns empty-ish input unchanged', () => {
    expect(stageLabel('')).toBe('');
    expect(stageLabel(null)).toBe('');
    expect(stageLabel(undefined)).toBe('');
  });
});
