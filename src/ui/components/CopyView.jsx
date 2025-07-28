const React = require('react');
const { useEffect, useState } = React;
const { Box, Text, Newline } = require('ink');
const { useAppContext } = require('../contexts/AppContext.js');
const usePipeline = require('../hooks/usePipeline');

const PipelineStatus = require('./PipelineStatus.jsx');
const Results = require('./Results.jsx');
const SummaryTable = require('./SummaryTable.jsx');
const StaticLog = require('./StaticLog.jsx');

const Pipeline = require('../../pipeline/Pipeline');
const ProfileLoader = require('../../profiles/ProfileLoader');
const GitHubUrlHandler = require('../../services/GitHubUrlHandler');
const { CommandError } = require('../../utils/errors');
const fs = require('fs-extra');
const path = require('path');
const Clipboard = require('../../utils/clipboard');

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
		updateState 
	} = useAppContext();
	
	const { runPipeline } = usePipeline();
	const [output, setOutput] = useState(null);
	const [processingStarted, setProcessingStarted] = useState(false);

	useEffect(() => {
		if (processingStarted || !targetPath) return;
		
		setProcessingStarted(true);
		startCopyProcess();
	}, [targetPath, options, processingStarted]);

	const startCopyProcess = async () => {
		const startTime = Date.now();
		
		try {
			// Check if this looks like an invalid command rather than a path
			if (targetPath && !targetPath.startsWith('/') && !targetPath.startsWith('./') && !targetPath.startsWith('../') && 
				!targetPath.includes('/') && !targetPath.includes('\\') && !targetPath.includes('.') && 
				(targetPath.includes(':') || targetPath.includes('-'))) {
				throw new CommandError(`Path does not exist: ${targetPath}`, 'copy');
			}
			
			// Handle dry-run mode early
			if (options.dryRun) {
				console.log('Dry run mode - showing what would be copied without doing it');
				console.log('Files would be processed from:', targetPath);
				process.exit(0);
				return;
			}
			
			updateState({ isLoading: true, currentStage: 'Initializing' });
			
			// 1. Load profile
			const profileLoader = new ProfileLoader();
			const profileName = options.profile || 'default';
			updateState({ currentStage: 'Loading profile' });
			const profile = await loadProfile(profileLoader, profileName, options);
			
			// 2. Validate and resolve path
			let basePath;
			if (GitHubUrlHandler.isGitHubUrl(targetPath)) {
				updateState({ currentStage: 'Cloning GitHub repository' });
				const githubHandler = new GitHubUrlHandler(targetPath);
				basePath = await githubHandler.getFiles();
			} else {
				updateState({ currentStage: 'Validating path' });
				basePath = path.resolve(targetPath);
				if (!await fs.pathExists(basePath)) {
					throw new CommandError(`Path does not exist: ${basePath}`, 'copy');
				}
			}
			
			updateState({ currentStage: 'Setting up pipeline' });
			
			// 3. Initialize pipeline with stages
			const pipeline = new Pipeline({
				continueOnError: true,
				emitProgress: true,
				...options // Pass all options to pipeline so stages can access them
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
				startTime
			});
			
			// Don't set currentStage here - let the completion message handle it
			
			// 5. Prepare output - dry-run mode handled earlier
			const outputResult = await prepareOutput(result, options);
			setOutput(outputResult.content);
			
			// Handle output actions and create completion message
			const completionMessage = await handleOutputAndCreateMessage(outputResult, options, result);
			
		} catch (err) {
			console.error(err.message);
			updateState({ 
				error: err,
				isLoading: false,
				currentStage: null
			});
			process.exit(1);
		}
	};

	const loadProfile = async (profileLoader, profileName, options) => {
		const overrides = {};
		
		if (options.filter) {
			overrides.filter = Array.isArray(options.filter) ? options.filter : [options.filter];
			overrides.include = Array.isArray(options.filter) ? options.filter : [options.filter];
		}
		
		if (options.includeHidden !== undefined) {
			overrides.options = overrides.options || {};
			overrides.options.includeHidden = options.includeHidden;
		}
		
		if (options.includeBinary !== undefined) {
			overrides.transformers = overrides.transformers || {};
			overrides.transformers.binary = {
				enabled: true,
				options: { action: 'include' }
			};
		}
		
		try {
			return await profileLoader.load(profileName, overrides);
		} catch (error) {
			return ProfileLoader.createDefault();
		}
	};

	const setupPipelineStages = async (basePath, profile, options) => {
		const stages = [];
		
		// Import stage classes
		const FileDiscoveryStage = require('../../pipeline/stages/FileDiscoveryStage');
		const ProfileFilterStage = require('../../pipeline/stages/ProfileFilterStage');
		const GitFilterStage = require('../../pipeline/stages/GitFilterStage'); 
		const ExternalSourceStage = require('../../pipeline/stages/ExternalSourceStage');
		const LimitStage = require('../../pipeline/stages/LimitStage');
		const SortFilesStage = require('../../pipeline/stages/SortFilesStage');
		const AlwaysIncludeStage = require('../../pipeline/stages/AlwaysIncludeStage');
		const FileLoadingStage = require('../../pipeline/stages/FileLoadingStage');
		const TransformStage = require('../../pipeline/stages/TransformStage');
		const CharLimitStage = require('../../pipeline/stages/CharLimitStage');
		const DeduplicateFilesStage = require('../../pipeline/stages/DeduplicateFilesStage');
		const OutputFormattingStage = require('../../pipeline/stages/OutputFormattingStage');
		
		// 1. File Discovery
		stages.push(FileDiscoveryStage);
		
		// 2. Profile Filtering
		stages.push(ProfileFilterStage);
		
		// 3. Git Filtering (if enabled)
		if (options.gitModified || options.gitBranch || options.gitStaged) {
			stages.push(GitFilterStage);
		}
		
		// 4. External Sources
		if (profile.externalSources && profile.externalSources.length > 0) {
			stages.push(ExternalSourceStage);
		}
		
		// 5. Limits
		if (options.maxFiles || profile.limits?.files) {
			stages.push(LimitStage);
		}
		
		// 6. Sort Files
		stages.push(SortFilesStage);
		
		// 7. Always Include
		if (profile.alwaysInclude && profile.alwaysInclude.length > 0) {
			stages.push(AlwaysIncludeStage);
		}
		
		// 8. File Loading
		stages.push(FileLoadingStage);
		
		// 9. Transform
		if (!options.noTransform) {
			stages.push(TransformStage);
		}
		
		// 10. Character Limit
		if (options.charLimit || profile.limits?.charLimit) {
			stages.push(CharLimitStage);
		}
		
		// 11. Deduplicate
		stages.push(DeduplicateFilesStage);
		
		// 12. Output Formatting
		stages.push(OutputFormattingStage);
		
		return stages;
	};

	const prepareOutput = async (result, options) => {
		let content = result.output || '';
		
		// Ensure content is a string
		if (typeof content === 'object') {
			content = JSON.stringify(content, null, 2);
		}
		
		return {
			content: String(content),
			format: options.format || 'xml',
			stats: result.stats || {}
		};
	};

	const handleOutputAndCreateMessage = async (outputResult, options, result) => {
		const stats = result.stats || {};
		const fileCount = stats.totalFiles || stats.processedFiles || stats.fileCount || 0;
		const totalSize = outputResult.content ? outputResult.content.length : 0;
		
		// Helper function to format bytes
		const formatBytes = (bytes) => {
			if (bytes === 0) return '0 B';
			const k = 1024;
			const sizes = ['B', 'KB', 'MB', 'GB'];
			const i = Math.floor(Math.log(bytes) / Math.log(k));
			return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
		};

		let destination = '';
		let action = '';

		// Handle --as-reference option
		if (options.asReference) {
			const format = options.format || 'xml';
			const extension = format === 'json' ? 'json' : 'xml';
			const tempFile = path.join(require('os').tmpdir(), `copytree-${Date.now()}.${extension}`);
			await fs.writeFile(tempFile, outputResult.content, 'utf8');
			
			try {
				await Clipboard.copyFileReference(tempFile);
				destination = '';
				action = 'copied as file reference';
			} catch (error) {
				destination = tempFile;
				action = 'saved';
			}
		} else if (options.output) {
			await fs.writeFile(options.output, outputResult.content, 'utf8');
			destination = options.output;
			action = 'saved';
		} else if (options.clipboard) {
			await Clipboard.copyText(outputResult.content);
			destination = 'clipboard';
			action = 'copied';
		} else if (options.display) {
			// Write output directly to stdout for --display option
			process.stdout.write(outputResult.content);
			destination = 'terminal';
			action = 'displayed';
		} else {
			// Default: copy to clipboard
			try {
				await Clipboard.copyText(outputResult.content);
				destination = 'clipboard';
				action = 'copied';
			} catch (error) {
				// If clipboard fails, save to temporary file
				const format = options.format || 'xml';
				const extension = format === 'json' ? 'json' : 'xml';
				const tempFile = path.join(require('os').tmpdir(), `copytree-${Date.now()}.${extension}`);
				await fs.writeFile(tempFile, outputResult.content, 'utf8');
				destination = tempFile;
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
		
		updateState({ 
			currentStage: `ICON:${icon}:${completionMessage}`,
			isLoading: false
		});
	};

	if (error) {
		return React.createElement(
			Box,
			{ flexDirection: 'column' },
			React.createElement(
				Text,
				{ color: 'red', bold: true },
				'✗ Error:'
			),
			React.createElement(
				Text,
				{ color: 'red' },
				error.message
			)
		);
	}

	return React.createElement(
		Box,
		{ flexDirection: 'column' },
		React.createElement(PipelineStatus, {
			currentStage,
			isLoading,
			progress
		}),
		React.createElement(StaticLog, { logs }),
		showResults && React.createElement(
			Box,
			{ flexDirection: 'column' },
			React.createElement(Results, {
				results,
				output,
				format: options.format || 'xml',
				showOutput: options.display
			}),
			React.createElement(SummaryTable, {
				stats,
				duration: stats.duration
			})
		)
	);
};

module.exports = CopyView;