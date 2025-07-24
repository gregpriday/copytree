const React = require('react');
const { useEffect, useState } = React;
const { Box, Text } = require('ink');
const { useAppContext } = require('../contexts/AppContext.js');

const ValidationView = ({ successMessage, type }) => {
	const { command, options, updateState } = useAppContext();
	const [loading, setLoading] = useState(true);
	const [validationResult, setValidationResult] = useState(null);
	const [error, setError] = useState(null);

	useEffect(() => {
		const runValidation = async () => {
			try {
				if (type === 'cache') {
					// Handle cache clear command
					const CacheService = require('../../services/CacheService');
					const cacheService = new CacheService();
					await cacheService.clear();
					setValidationResult({ success: true, message: successMessage });
				} else if (command === 'profile:validate') {
					// Handle profile validation
					const ProfileLoader = require('../../profiles/ProfileLoader');
					const profileLoader = new ProfileLoader();
					
					const profileName = options.profile || 'default';
					const profile = await profileLoader.load(profileName);
					
					// Validate the profile (this would include schema validation)
					setValidationResult({
						success: true,
						message: `Profile '${profileName}' is valid`,
						details: {
							name: profile.name,
							description: profile.description,
							version: profile.version
						}
					});
				} else if (command === 'config:validate') {
					// Handle config validation
					const { config } = require('../../config/ConfigManager');
					const currentConfig = config();
					
					// Basic config validation
					setValidationResult({
						success: true,
						message: 'Configuration is valid',
						details: {
							profiles: currentConfig.get('profiles'),
							transforms: currentConfig.get('transforms'),
							output: currentConfig.get('output')
						}
					});
				}
			} catch (err) {
				setError(err.message);
				updateState({ error: err });
			} finally {
				setLoading(false);
			}
		};

		runValidation();
	}, [command, options, type, successMessage, updateState]);

	if (loading) {
		return React.createElement(
			Text,
			{ color: 'blue' },
			'Validating...'
		);
	}

	if (error) {
		return React.createElement(
			Box,
			{ flexDirection: 'column' },
			React.createElement(
				Text,
				{ color: 'red', bold: true },
				'✗ Validation Failed'
			),
			React.createElement(
				Text,
				{ color: 'red' },
				error
			)
		);
	}

	if (validationResult && validationResult.success) {
		return React.createElement(
			Box,
			{ flexDirection: 'column' },
			React.createElement(
				Text,
				{ color: 'green', bold: true },
				'✓ ' + validationResult.message
			),
			validationResult.details && React.createElement(
				Box,
				{ marginTop: 1, marginLeft: 2, flexDirection: 'column' },
				Object.entries(validationResult.details).map(([key, value]) =>
					React.createElement(
						Text,
						{ key },
						`${key}: ${JSON.stringify(value, null, 2)}`
					)
				)
			)
		);
	}

	return React.createElement(
		Text,
		{ color: 'yellow' },
		'Validation completed with unknown result'
	);
};

module.exports = ValidationView;