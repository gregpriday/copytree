import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

const AppContext = createContext();

const AppProvider = ({ children }) => {
  const [state, setState] = useState({
    // Command inputs
    command: null,
    path: null,
    options: {},
		
    // Pipeline state
    currentStage: null,
    progress: 0,
    isLoading: false,
		
    // Results
    results: null,
    output: null,
    stats: {},
		
    // Errors
    error: null,
		
    // UI state
    showResults: false,
    logs: [],
    completionIcon: null,
  });

  const updateState = useCallback((updates) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Batch logs to reduce re-render frequency
  const logBatch = useRef([]);
  const logFlushTimer = useRef(null);

  const flushLogs = useCallback(() => {
    if (logBatch.current.length > 0) {
      setState((prev) => ({
        ...prev,
        logs: [...prev.logs, ...logBatch.current],
      }));
      logBatch.current = [];
    }
    logFlushTimer.current = null;
  }, []);

  const addLog = useCallback((log) => {
    logBatch.current.push({ ...log, timestamp: Date.now() });
		
    // Flush logs every 50ms or when batch reaches 10 items
    if (logBatch.current.length >= 10) {
      if (logFlushTimer.current) {
        clearTimeout(logFlushTimer.current);
      }
      flushLogs();
    } else if (!logFlushTimer.current) {
      logFlushTimer.current = setTimeout(flushLogs, 50);
    }
  }, [flushLogs]);

  const clearLogs = useCallback(() => {
    setState((prev) => ({ ...prev, logs: [] }));
  }, []);

  const resetState = useCallback(() => {
    // Clear any pending log flush
    if (logFlushTimer.current) {
      clearTimeout(logFlushTimer.current);
      logFlushTimer.current = null;
    }
    logBatch.current = [];
		
    setState({
      command: null,
      path: null,
      options: {},
      currentStage: null,
      progress: 0,
      isLoading: false,
      results: null,
      output: null,
      stats: {},
      error: null,
      showResults: false,
      logs: [],
    });
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (logFlushTimer.current) {
        clearTimeout(logFlushTimer.current);
      }
    };
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // Frequently changing values
    currentStage: state.currentStage,
    progress: state.progress,
    isLoading: state.isLoading,
    error: state.error,
    showResults: state.showResults,
		
    // Less frequently changing values
    command: state.command,
    path: state.path,
    options: state.options,
    results: state.results,
    output: state.output,
    stats: state.stats,
    logs: state.logs,
		
    // Stable function references
    updateState,
    addLog,
    clearLogs,
    resetState,
  }), [
    state.currentStage,
    state.progress,
    state.isLoading,
    state.error,
    state.showResults,
    state.command,
    state.path,
    state.options,
    state.results,
    state.output,
    state.stats,
    state.logs,
    updateState,
    addLog,
    clearLogs,
    resetState,
  ]);

  return React.createElement(AppContext.Provider, { value }, children);
};

const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

export { AppProvider, useAppContext };