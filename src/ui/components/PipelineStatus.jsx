const React = require('react');
const { Box, Text } = require('ink');

const PipelineStatus = ({ currentStage, isLoading, message, progress }) => {
	if (!isLoading && !currentStage) {
		return null;
	}

	const displayMessage = message || currentStage || 'Processing...';
	const progressText = progress > 0 ? ` (${Math.round(progress)}%)` : '';

	return React.createElement(
		Text,
		{ color: 'blue' },
		(isLoading ? '⏳ ' : '✓ ') + displayMessage + progressText
	);
};

module.exports = PipelineStatus;