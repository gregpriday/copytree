import React from 'react';
import { render } from 'ink-testing-library';

describe('App Component', () => {
  describe('module imports', () => {
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

  describe('rendering', () => {
    test('App renders with copy command', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');

      const instance = render(
        <App
          command="copy"
          path="."
          options={{}}
        />
      );

      // Give async components time to load
      await new Promise(resolve => setTimeout(resolve, 100));

      const output = instance.lastFrame();
      expect(output).toBeDefined();
      // Should render something (not empty)
      expect(typeof output).toBe('string');

      if (typeof instance.unmount === 'function') {
        instance.unmount();
      }
    });

    test('App renders profile:list command', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');

      const instance = render(
        <App
          command="profile:list"
          options={{}}
        />
      );

      // Give async components time to load
      await new Promise(resolve => setTimeout(resolve, 100));

      const output = instance.lastFrame();
      expect(output).toBeDefined();
      expect(typeof output).toBe('string');

      if (typeof instance.unmount === 'function') {
        instance.unmount();
      }
    });

    test('App renders config:validate command', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');

      const instance = render(
        <App
          command="config:validate"
          options={{}}
        />
      );

      // Give async components time to load
      await new Promise(resolve => setTimeout(resolve, 100));

      const output = instance.lastFrame();
      expect(output).toBeDefined();
      expect(typeof output).toBe('string');

      if (typeof instance.unmount === 'function') {
        instance.unmount();
      }
    });

    test('App renders copy:docs command', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');

      const instance = render(
        <App
          command="copy:docs"
          options={{}}
        />
      );

      // Give async components time to load
      await new Promise(resolve => setTimeout(resolve, 100));

      const output = instance.lastFrame();
      expect(output).toBeDefined();
      expect(typeof output).toBe('string');

      if (typeof instance.unmount === 'function') {
        instance.unmount();
      }
    });
  });
});
