import React from 'react';

describe('App Component', () => {
  test('App module can be imported without errors', async () => {
    const { default: App } = await import('../../../../src/ui/App.js');
    expect(typeof App).toBe('function');
  });

  test('AppContext can be imported without errors', async () => {
    const { AppProvider, useAppContext } = await import(
      '../../../../src/ui/contexts/AppContext.js'
    );
    expect(typeof AppProvider).toBe('function');
    expect(typeof useAppContext).toBe('function');
  });

  test('UI components can be imported without errors', async () => {
    const { default: PipelineStatus } = await import(
      '../../../../src/ui/components/PipelineStatus.js'
    );
    const { default: Results } = await import('../../../../src/ui/components/Results.js');
    const { default: SummaryTable } = await import('../../../../src/ui/components/SummaryTable.js');
    const { default: StaticLog } = await import('../../../../src/ui/components/StaticLog.js');

    expect(typeof PipelineStatus).toBe('function');
    expect(typeof Results).toBe('function');
    expect(typeof SummaryTable).toBe('function');
    expect(typeof StaticLog).toBe('function');
  });

  test('usePipeline hook can be imported without errors', async () => {
    const { default: usePipeline } = await import('../../../../src/ui/hooks/usePipeline.js');
    expect(typeof usePipeline).toBe('function');
  });
});
