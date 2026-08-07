import React from 'react';
import { render } from 'ink-testing-library';

describe('App Component', () => {
  describe('module imports', () => {
    test('App module can be imported without errors', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');
      expect(typeof App).toBe('function');
    });

    test('AppContext can be imported without errors', async () => {
      const { AppProvider, useAppContext } =
        await import('../../../../src/ui/contexts/AppContext.js');
      expect(typeof AppProvider).toBe('function');
      expect(typeof useAppContext).toBe('function');
    });

    test('config views can be imported without errors', async () => {
      const { default: ValidationView } =
        await import('../../../../src/ui/components/ValidationView.js');
      const { default: ConfigInspectView } =
        await import('../../../../src/ui/components/ConfigInspectView.js');

      expect(typeof ValidationView).toBe('function');
      expect(typeof ConfigInspectView).toBe('function');
    });
  });

  describe('rendering', () => {
    // `copy` is not an Ink command any more. It renders one progress line and
    // one completion line through the terminal reporter, so App must fall
    // through to the unknown-command branch rather than mount a view.
    test('App does not render a view for the copy command', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');

      const instance = render(<App command="copy" path="." options={{}} />);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const output = instance.lastFrame();
      expect(output === null || typeof output === 'string').toBe(true);
      if (typeof output === 'string' && output.length > 0) {
        expect(output).toContain('Unknown command');
      }

      if (typeof instance.unmount === 'function') {
        instance.unmount();
      }
    });

    test('App renders config:validate command', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');

      const instance = render(<App command="config:validate" options={{}} />);

      // Give async components time to load
      await new Promise((resolve) => setTimeout(resolve, 100));

      const output = instance.lastFrame();
      expect(output).toBeDefined();
      expect(typeof output).toBe('string');

      if (typeof instance.unmount === 'function') {
        instance.unmount();
      }
    });

    test('App handles unknown commands', async () => {
      const { default: App } = await import('../../../../src/ui/App.js');

      const instance = render(<App command="unknown" options={{}} />);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const output = instance.lastFrame();
      expect(output === null || typeof output === 'string').toBe(true);
      if (typeof output === 'string' && output.length > 0) {
        expect(output).toContain('Unknown command');
      }

      if (typeof instance.unmount === 'function') {
        instance.unmount();
      }
    });
  });
});
