import React from 'react';
import { render } from 'ink-testing-library';
import SummaryTable from '../../../../src/ui/components/SummaryTable.js';

describe('SummaryTable Component', () => {
  test('renders null when no stats provided', () => {
    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats: null,
        duration: null,
      }),
    );

    expect(lastFrame()).toBe('');
  });

  test('renders null when empty stats object', () => {
    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats: {},
        duration: null,
      }),
    );

    expect(lastFrame()).toBe('');
  });

  test('renders summary with file counts', () => {
    const stats = {
      filesProcessed: 42,
      directoriesProcessed: 8,
      filesTransformed: 15,
    };

    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats,
        duration: 1500,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('Summary');
    expect(output).toContain('Files processed');
    expect(output).toContain('42');
    expect(output).toContain('Directories processed');
    expect(output).toContain('8');
    expect(output).toContain('Files transformed');
    expect(output).toContain('15');
    expect(output).toContain('Duration');
    expect(output).toContain('1.5s');
  });

  test('formats file sizes correctly', () => {
    const stats = {
      totalSize: 1024 * 1024 + 512 * 1024, // 1.5 MB
      outputSize: 1024, // 1 KB
    };

    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats,
        duration: null,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('Total size');
    expect(output).toContain('1.5 MB');
    expect(output).toContain('Output size');
    expect(output).toContain('1 KB');
  });

  test('formats duration correctly for milliseconds', () => {
    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats: { filesProcessed: 1 },
        duration: 500,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('500ms');
  });

  test('formats duration correctly for seconds', () => {
    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats: { filesProcessed: 1 },
        duration: 2500,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('2.5s');
  });

  test('shows detailed timing when showDetailedTiming is true', () => {
    const stats = {
      filesProcessed: 5,
      perStageTimings: {
        FileDiscovery: 100,
        ProfileFiltering: 50,
        Transformation: 200,
      },
      totalStageTime: 350,
      averageStageTime: 116.7,
    };

    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats,
        duration: 400,
        showDetailedTiming: true,
      }),
    );

    const output = lastFrame();
    expect(output).toContain('Stage Timings:');
    expect(output).toContain('FileDiscovery');
    expect(output).toContain('100ms');
  });

  test('hides detailed timing when showDetailedTiming is false', () => {
    const stats = {
      filesProcessed: 5,
      perStageTimings: {
        FileDiscovery: 100,
        ProfileFiltering: 50,
      },
      totalStageTime: 150,
    };

    const { lastFrame } = render(
      React.createElement(SummaryTable, {
        stats,
        duration: 200,
        showDetailedTiming: false,
      }),
    );

    const output = lastFrame();
    expect(output).not.toContain('Stage Timings:');
    expect(output).not.toContain('FileDiscovery');
  });
});
