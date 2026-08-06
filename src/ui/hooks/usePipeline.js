import { useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext.js';

// Kept as a plain factory (not itself a hook) so listener wiring is
// unit-testable without rendering a React tree.
export const createRunPipeline = (updateState, addLog) => {
  return async (pipeline, input) => {
    let startTime = null;
    let progressTimer = null;

    // Debounced state update to prevent excessive re-renders
    const debouncedUpdateState = (updates) => {
      if (progressTimer) {
        clearTimeout(progressTimer);
      }
      progressTimer = setTimeout(() => {
        updateState(updates);
        progressTimer = null;
      }, 30); // Update max every 30ms
    };

    const handlePipelineStart = (data) => {
      startTime = Date.now();
      updateState({
        isLoading: true,
        currentStage: 'Starting pipeline...',
        progress: 0,
        error: null,
        stats: {},
      });
      addLog({
        type: 'info',
        message: `Starting pipeline with ${data.stages} stages`,
      });
    };

    const handleStageStart = (data) => {
      const progress = (data.index / pipeline.stages.length) * 100;
      debouncedUpdateState({
        currentStage: data.stage,
        progress,
        isLoading: true,
      });
      addLog({
        type: 'info',
        message: `Starting stage: ${data.stage}`,
      });
    };

    const handleStageComplete = (data) => {
      const progress = ((data.index + 1) / pipeline.stages.length) * 100;
      debouncedUpdateState({
        currentStage: data.stage,
        progress,
      });
      addLog({
        type: 'success',
        message: `Completed stage: ${data.stage}`,
      });
    };

    const handleStageError = (data) => {
      addLog({
        type: 'error',
        message: `Error in stage ${data.stage}: ${data.error.message}`,
      });
    };

    const handlePipelineComplete = (data) => {
      const duration = Date.now() - (startTime ?? Date.now());
      updateState({
        isLoading: false,
        currentStage: null,
        progress: 100,
        results: data.result,
        stats: {
          ...data.stats,
          duration,
        },
        showResults: true,
      });
      addLog({
        type: 'success',
        message: `Pipeline completed successfully in ${duration}ms`,
      });
    };

    const handlePipelineError = (data) => {
      const duration = Date.now() - (startTime ?? Date.now());
      updateState({
        isLoading: false,
        currentStage: null,
        error: data.error,
        stats: {
          ...data.stats,
          duration,
        },
      });
      addLog({
        type: 'error',
        message: `Pipeline failed: ${data.error.message}`,
      });
    };

    const handleStageLog = (data) => {
      addLog({
        type: data.level === 'debug' ? 'info' : data.level,
        message: `[${data.stage}] ${data.message}`,
      });
    };

    const handleStageProgress = (data) => {
      debouncedUpdateState({
        currentStage: data.message || data.stage,
        progress: data.progress,
      });
    };

    const handleFileEvent = (data) => {
      addLog({
        type: 'success',
        message: `${data.action}: ${data.filePath}`,
      });
    };

    const handleFileBatch = (data) => {
      addLog({
        type: 'success',
        message: `[${data.stage}] Processed ${data.count} files (latest: ${data.lastFile})`,
      });
    };

    const listeners = [
      ['pipeline:start', handlePipelineStart],
      ['stage:start', handleStageStart],
      ['stage:complete', handleStageComplete],
      ['stage:error', handleStageError],
      ['stage:log', handleStageLog],
      ['stage:progress', handleStageProgress],
      ['file:processed', handleFileEvent],
      ['file:transformed', handleFileEvent],
      ['file:loaded', handleFileEvent],
      ['file:batch', handleFileBatch],
      ['pipeline:complete', handlePipelineComplete],
      ['pipeline:error', handlePipelineError],
    ];

    try {
      // Attach before process() starts so no early events (e.g.
      // pipeline:start) are missed, and always detach — even if process()
      // throws — so a reused pipeline instance never accumulates stale
      // listeners.
      for (const [event, handler] of listeners) {
        pipeline.on(event, handler);
      }

      return await pipeline.process(input);
    } finally {
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
      for (const [event, handler] of listeners) {
        pipeline.off(event, handler);
      }
    }
  };
};

const usePipeline = () => {
  const { updateState, addLog } = useAppContext();
  const runPipeline = useMemo(() => createRunPipeline(updateState, addLog), [updateState, addLog]);

  return { runPipeline };
};

export default usePipeline;
