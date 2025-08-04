const React = require('react');

// Use dynamic import for ESM-only ink in CommonJS context
let Box, Text;
(async () => {
  try {
    const ink = await import('ink');
    Box = ink.Box;
    Text = ink.Text;
  } catch (error) {
    // Defer error until first usage attempt
    Box = undefined;
    Text = undefined;
  }
})().catch(() => {
  Box = undefined;
  Text = undefined;
});

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
    icon + displayMessage + progressText,
  );
};

module.exports = PipelineStatus;