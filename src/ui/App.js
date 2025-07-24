const React = require('react');
const { useEffect } = React;
const { Text } = require('ink');
const { AppProvider, useAppContext } = require('./contexts/AppContext.js');

const CopyView = require('./components/CopyView.jsx');
const ProfileListView = require('./components/ProfileListView.jsx');
const ValidationView = require('./components/ValidationView.jsx');

const AppContent = () => {
	const { command, updateState } = useAppContext();

	const renderView = () => {
		if (!command) {
			return React.createElement(Text, null, 'Loading...');
		}

		switch (command) {
			case 'copy':
				return React.createElement(CopyView);
			case 'profile:list':
				return React.createElement(ProfileListView);
			case 'profile:validate':
			case 'config:validate':
				return React.createElement(ValidationView);
			case 'cache:clear':
				return React.createElement(ValidationView, { 
					successMessage: 'Cache cleared successfully',
					type: 'cache'
				});
			default:
				return React.createElement(Text, { color: 'red' }, `Unknown command: ${command}`);
		}
	};

	return renderView();
};

const App = ({ command, path, options }) => {
	return React.createElement(
		AppProvider,
		null,
		React.createElement(AppInitializer, { command, path, options })
	);
};

const AppInitializer = ({ command, path, options }) => {
	const { updateState } = useAppContext();

	useEffect(() => {
		updateState({
			command,
			path: path || '.',
			options: options || {}
		});
	}, [command, path, options, updateState]);

	return React.createElement(AppContent);
};

module.exports = App;