const React = require('react');
const { Box, Text } = require('ink');

const PipelineStatus = ({ currentStage, isLoading, message, progress }) => {
	if (!isLoading && !currentStage) {
		return null;
	}

	let displayMessage = message || currentStage || 'Processing...';
	let icon = isLoading ? '⏳ ' : '🟢 ';
	
	// Check if the message contains an icon prefix
	if (displayMessage.startsWith('ICON:')) {
		const parts = displayMessage.split(':');
		if (parts.length >= 3) {
			icon = parts[1] + ' ';
			displayMessage = parts.slice(2).join(':');
		}
	}
	
	const progressText = progress > 0 ? ` (${Math.round(progress)}%)` : '';
	
	return React.createElement(
		Text,
		{ color: isLoading ? 'blue' : 'green' },
		icon + displayMessage + progressText
	);
};

module.exports = PipelineStatus;