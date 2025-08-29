import React from 'react';
import { render } from 'ink-testing-library';
import PipelineStatus from '../../../../src/ui/components/PipelineStatus.js';

describe('PipelineStatus Component', () => {
  test('renders null when not loading and no current stage', () => {
    const { lastFrame } = render(
      React.createElement(PipelineStatus, {
        currentStage: null,
        isLoading: false,
        message: null,
        progress: 0,
      }),
    );

    expect(lastFrame()).toBe('');
  });

  test('renders loading spinner with stage name', () => {
    const { lastFrame } = render(
      React.createElement(PipelineStatus, {
        currentStage: 'FileDiscoveryStage',
        isLoading: true,
        message: 'Discovering files...',
        progress: 0,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('Discovering files...');
  });

  test('renders progress percentage when provided', () => {
    const { lastFrame } = render(
      React.createElement(PipelineStatus, {
        currentStage: 'TransformStage',
        isLoading: true,
        message: 'Transforming files',
        progress: 75,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('Transforming files (75%)');
  });

  test('uses current stage as message when no message provided', () => {
    const { lastFrame } = render(
      React.createElement(PipelineStatus, {
        currentStage: 'ProcessingStage',
        isLoading: true,
        message: null,
        progress: 0,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('ProcessingStage');
  });

  test('shows default message when no stage or message', () => {
    const { lastFrame } = render(
      React.createElement(PipelineStatus, {
        currentStage: null,
        isLoading: true,
        message: null,
        progress: 0,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('Processing...');
  });
});
