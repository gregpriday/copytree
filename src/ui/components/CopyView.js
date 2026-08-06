import React, { useEffect, useState } from 'react';
import { useAppContext } from '../contexts/AppContext.js';

// Use dynamic import for ESM-only ink with proper loading state
let Box, Text, Newline;
let inkLoaded = false;
const inkLoadPromise = (async () => {
  try {
    const ink = await import('ink');
    Box = ink.Box;
    Text = ink.Text;
    Newline = ink.Newline;
    inkLoaded = true;
  } catch (error) {
    // Defer error until first usage attempt
    Box = undefined;
    Text = undefined;
    Newline = undefined;
    console.error('Failed to load Ink components:', error);
  }
})();
import usePipeline from '../hooks/usePipeline.js';

import PipelineStatus from './PipelineStatus.js';
import Results from './Results.js';
import SummaryTable from './SummaryTable.js';
import StaticLog from './StaticLog.js';

import Pipeline from '../../pipeline/Pipeline.js';
import GitHubUrlHandler from '../../services/GitHubUrlHandler.js';
import { CommandError } from '../../utils/errors.js';
import fs from 'fs-extra';
import path from 'path';
import Clipboard from '../../utils/clipboard.js';
import { resolveDestination, writeReferenceFile } from '../../utils/outputDestination.js';
import { config } from '../../config/ConfigManager.js';
import { buildProfileFromCliOptions, setupPipelineStages } from '../../commands/copy.js';

const CopyView = () => {
  const {
    path: targetPath,
    options,
    isLoading,
    currentStage,
    progress,
    results,
    stats,
    error,
    showResults,
    logs,
    updateState,
  } = useAppContext();

  const { runPipeline } = usePipeline();
  const [output, setOutput] = useState(null);
  const [processingStarted, setProcessingStarted] = useState(false);
  const [inkReady, setInkReady] = useState(inkLoaded);

  // Wait for Ink components to load
  useEffect(() => {
    if (!inkLoaded) {
      inkLoadPromise.then(() => setInkReady(true));
    }
  }, []);

  useEffect(() => {
    if (processingStarted || !targetPath) return;

    setProcessingStarted(true);
    startCopyProcess();
  }, [targetPath, options, processingStarted]);

  const startCopyProcess = async () => {
    const startTime = Date.now();

    try {
      // Handle dry-run mode early.
      //
      // Delegated wholesale to the command implementation rather than
      // reimplemented here. A preview whose selection logic differs from the
      // real run is worse than no preview, and every option the CLI accepts
      // (--ext, --min-size, --no-tests, --head, ...) is already handled there.
      if (options.dryRun) {
        const copyCommand = (await import('../../commands/copy.js')).default;
        await copyCommand(targetPath, options);
        process.exit(0);
        return;
      }

      updateState({ isLoading: true, currentStage: 'Initializing' });

      // Ensure configuration is loaded before proceeding
      await config().loadConfiguration();

      updateState({ currentStage: 'Preparing configuration' });
      // Same profile builder the non-UI path uses. The UI used to construct its
      // own, which silently dropped most flags: it read `options.alwaysInclude`
      // where the CLI sets `options.always`, and passed nothing at all to the
      // discovery stage.
      const profile = await buildProfileFromCliOptions(options, path.resolve(targetPath));

      // 2. Validate and resolve path
      let basePath;
      if (GitHubUrlHandler.isGitHubUrl(targetPath)) {
        updateState({ currentStage: 'Cloning GitHub repository' });
        const githubHandler = new GitHubUrlHandler(targetPath);
        basePath = await githubHandler.getFiles();
      } else {
        updateState({ currentStage: 'Validating path' });
        basePath = path.resolve(targetPath);
        if (!(await fs.pathExists(basePath))) {
          throw new CommandError(`Path does not exist: ${basePath}`, 'copy');
        }
      }

      updateState({ currentStage: 'Setting up pipeline' });

      // 3. Initialize pipeline with stages
      const pipeline = new Pipeline({
        continueOnError: true,
        emitProgress: true,
        ...options, // Pass all options to pipeline so stages can access them
      });

      // Setup pipeline stages
      updateState({ currentStage: 'Configuring stages' });
      const stages = await setupPipelineStages(basePath, profile, options);
      updateState({ currentStage: 'Adding stages to pipeline' });
      pipeline.through(stages);

      // 4. Execute pipeline
      updateState({ currentStage: 'Starting pipeline execution' });
      const result = await runPipeline(pipeline, {
        basePath,
        profile,
        options,
        startTime,
      });

      // Don't set currentStage here - let the completion message handle it

      // 5. Prepare output - dry-run mode handled earlier
      const outputResult = await prepareOutput(result, options);
      setOutput(outputResult.content);

      // Handle output actions and create completion message
      const completionMessage = await handleOutputAndCreateMessage(
        outputResult,
        options,
        result,
        basePath,
      );
    } catch (err) {
      console.error(err.message);
      updateState({
        error: err,
        isLoading: false,
        currentStage: null,
      });
      process.exit(1);
    }
  };

  const prepareOutput = async (result, options) => {
    let content = result.output || '';

    // Ensure content is a string
    if (typeof content === 'object') {
      content = JSON.stringify(content, null, 2);
    }

    return {
      content: String(content),
      format:
        (options.format ? String(options.format).toLowerCase() : 'xml') === 'md'
          ? 'markdown'
          : options.format
            ? String(options.format).toLowerCase()
            : 'xml',
      stats: result.stats || {},
    };
  };

  const handleOutputAndCreateMessage = async (outputResult, options, result, basePath) => {
    const stats = result.stats || {};
    // Count only non-null files (nulls are placeholders for filtered binary files)
    const fileCount = result.files
      ? result.files.filter((f) => f !== null).length
      : stats.totalFiles || stats.processedFiles || stats.fileCount || 0;
    const totalSize = outputResult.content ? outputResult.content.length : 0;

    // Helper function to format bytes
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    let destination;
    let action;

    // Same resolution the non-UI path uses, so the two cannot drift. They
    // already had: this branch knew nothing about `ndjson` or `sarif`, so a
    // reference to NDJSON output was written to a file named `.xml`.
    const resolved = resolveDestination(options);

    if (resolved === 'reference') {
      const tempFile = await writeReferenceFile(outputResult.content, basePath, options.format);

      try {
        await Clipboard.copyFileReference(tempFile);
        destination = '';
        action = 'copied as file reference';
      } catch (error) {
        destination = tempFile;
        action = 'saved';
      }
    } else if (resolved === 'file') {
      await fs.writeFile(options.output, outputResult.content, 'utf8');
      destination = options.output;
      action = 'saved';
    } else if (resolved === 'display') {
      // Write output directly to stdout for --display option
      process.stdout.write(outputResult.content);
      destination = 'terminal';
      action = 'displayed';
    } else {
      // --clipboard: the output text itself, not a reference to it.
      try {
        await Clipboard.copyText(outputResult.content);
        destination = 'clipboard';
        action = 'copied';
      } catch (error) {
        // If clipboard fails, save to temporary file
        destination = await writeReferenceFile(outputResult.content, basePath, options.format);
        action = 'saved';
      }
    }

    // Determine the appropriate icon based on the action
    let icon = '✅'; // default green checkmark
    if (action.includes('saved') || destination.includes('.')) {
      icon = '💾'; // floppy disk for saved files
    } else if (action.includes('copied as file reference')) {
      icon = '📎'; // paperclip for file references
    } else if (action.includes('copied') || destination === 'clipboard') {
      icon = '✅'; // green checkmark for clipboard operations
    } else if (destination === 'terminal' || action.includes('displayed')) {
      icon = '🖥️'; // monitor for terminal display
    }

    // Create comprehensive completion message with icon
    const sizeText = totalSize > 0 ? ` [${formatBytes(totalSize)}]` : '';
    const completionMessage = destination
      ? `${fileCount} files${sizeText} ${action} to ${destination}`
      : `${fileCount} files${sizeText} ${action}`;

    // KNOWN BUG, pre-existing and not specific to this destination: when the
    // run ends via `--clipboard`, Ink writes no frame at all and a successful
    // copy reports nothing. The clipboard does receive the content. Every other
    // destination happens to leave slow work pending (a file write, an
    // osascript spawn) and renders normally.
    //
    // It reproduces on the commit before reference output became the default,
    // where clipboard *was* the default. Not a render-throttle race: waiting
    // 500ms after this update changes nothing, so the frame is never queued
    // rather than never flushed.
    updateState({
      currentStage: `ICON:${icon}:${completionMessage}`,
      isLoading: false,
    });
  };

  // Don't render until Ink components are loaded
  if (!inkReady) {
    return React.createElement('div', null, 'Loading...');
  }

  if (error) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(Text, { color: 'red', bold: true }, '✗ Error:'),
      React.createElement(Text, { color: 'red' }, error.message),
    );
  }

  // `--display` puts the formatted document itself on stdout, and Ink renders
  // to that same stream. Anything the UI draws is therefore interleaved with
  // the document, which breaks the one thing a caller doing
  // `copytree --display | jq` is relying on. So in that mode the UI is reduced
  // to the single completion line that trails the document, with no progress
  // suffix, no per-stage log stream, and no boxed preview of output that was
  // already written verbatim. Progress feedback still belongs on stdout in
  // every other destination, where stdout is not carrying the document.
  const documentOnStdout = resolveDestination(options) === 'display';

  if (documentOnStdout) {
    return React.createElement(PipelineStatus, {
      currentStage,
      isLoading,
      progress: 0,
    });
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(PipelineStatus, {
      currentStage,
      isLoading,
      progress,
    }),
    React.createElement(StaticLog, { logs }),
    showResults &&
      React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(Results, {
          results,
          output,
          format:
            (options.format ? String(options.format).toLowerCase() : 'xml') === 'md'
              ? 'markdown'
              : options.format
                ? String(options.format).toLowerCase()
                : 'xml',
          showOutput: options.display,
        }),
        React.createElement(SummaryTable, {
          stats,
          duration: stats.duration,
          showDetailedTiming: options.info,
        }),
      ),
  );
};

export default CopyView;
