import React, { useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext.js';

const usePipeline = () => {
  const { updateState, addLog } = useAppContext();
  const pipelineRef = useRef(null);
  const startTimeRef = useRef(null);
  const progressUpdateTimer = useRef(null);

  // Debounced state update to prevent excessive re-renders
  const debouncedUpdateState = useCallback(
    (updates) => {
      if (progressUpdateTimer.current) {
        clearTimeout(progressUpdateTimer.current);
      }
      progressUpdateTimer.current = setTimeout(() => {
        updateState(updates);
        progressUpdateTimer.current = null;
      }, 30); // Update max every 30ms
    },
    [updateState],
  );

  useEffect(() => {
    if (!pipelineRef.current) return;

    const pipeline = pipelineRef.current;

    const handlePipelineStart = (data) => {
      startTimeRef.current = Date.now();
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
      const duration = Date.now() - startTimeRef.current;
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
      const duration = Date.now() - startTimeRef.current;
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

    // Register event listeners
    pipeline.on('pipeline:start', handlePipelineStart);
    pipeline.on('stage:start', handleStageStart);
    pipeline.on('stage:complete', handleStageComplete);
    pipeline.on('stage:error', handleStageError);
    pipeline.on('stage:log', handleStageLog);
    pipeline.on('stage:progress', handleStageProgress);
    pipeline.on('file:processed', handleFileEvent);
    pipeline.on('file:transformed', handleFileEvent);
    pipeline.on('file:loaded', handleFileEvent);
    pipeline.on('file:batch', handleFileBatch);
    pipeline.on('pipeline:complete', handlePipelineComplete);
    pipeline.on('pipeline:error', handlePipelineError);

    // Cleanup
    return () => {
      if (progressUpdateTimer.current) {
        clearTimeout(progressUpdateTimer.current);
      }
      pipeline.off('pipeline:start', handlePipelineStart);
      pipeline.off('stage:start', handleStageStart);
      pipeline.off('stage:complete', handleStageComplete);
      pipeline.off('stage:error', handleStageError);
      pipeline.off('stage:log', handleStageLog);
      pipeline.off('stage:progress', handleStageProgress);
      pipeline.off('file:processed', handleFileEvent);
      pipeline.off('file:transformed', handleFileEvent);
      pipeline.off('file:loaded', handleFileEvent);
      pipeline.off('file:batch', handleFileBatch);
      pipeline.off('pipeline:complete', handlePipelineComplete);
      pipeline.off('pipeline:error', handlePipelineError);
    };
  }, [updateState, addLog, debouncedUpdateState]);

  const runPipeline = async (pipeline, input) => {
    pipelineRef.current = pipeline;
    return await pipeline.process(input);
  };

  return { runPipeline };
};

export default usePipeline;
