const React = require('react');
const { useEffect, useState } = React;
const { Box, Text, Newline } = require('ink');
const { useAppContext } = require('../contexts/AppContext.js');
const ProfileLoader = require('../../profiles/ProfileLoader');

const ProfileGroup = ({ title, profiles, color }) => {
	if (!profiles || profiles.length === 0) {
		return null;
	}

	return React.createElement(
		Box,
		{ flexDirection: 'column', marginBottom: 1 },
		React.createElement(
			Text,
			{ color, bold: true },
			title + ':'
		),
		...profiles.map(profile =>
			React.createElement(
				Box,
				{ key: profile.name, marginLeft: 2 },
				React.createElement(
					Text,
					{ bold: true },
					profile.name.padEnd(20)
				),
				React.createElement(
					Text,
					{ dimColor: true },
					profile.description || 'No description'
				)
			)
		)
	);
};

const ProfileDetails = ({ profiles }) => {
	return React.createElement(
		Box,
		{ flexDirection: 'column', marginTop: 1 },
		React.createElement(
			Text,
			{ bold: true, color: 'yellow' },
			'Profile Details:'
		),
		React.createElement(Newline),
		...profiles.map(profile =>
			React.createElement(
				Box,
				{ key: profile.name, flexDirection: 'column', marginBottom: 1 },
				React.createElement(
					Text,
					{ bold: true },
					profile.name + ':'
				),
				React.createElement(
					Box,
					{ marginLeft: 2, flexDirection: 'column' },
					React.createElement(
						Text,
						null,
						`Description: ${profile.description || 'No description'}`
					),
					React.createElement(
						Text,
						null,
						`Source: ${profile.source}`
					),
					React.createElement(
						Text,
						null,
						`Path: ${profile.path}`
					),
					profile.version && React.createElement(
						Text,
						null,
						`Version: ${profile.version}`
					)
				)
			)
		)
	);
};

const ProfileListView = () => {
	const { options, updateState } = useAppContext();
	const [profiles, setProfiles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const loadProfiles = async () => {
			try {
				const profileLoader = new ProfileLoader();
				const availableProfiles = await profileLoader.listAvailable();
				setProfiles(availableProfiles);
			} catch (err) {
				setError(err.message);
				updateState({ error: err });
			} finally {
				setLoading(false);
			}
		};

		loadProfiles();
	}, [updateState]);

	if (loading) {
		return React.createElement(
			Text,
			{ color: 'blue' },
			'Loading profiles...'
		);
	}

	if (error) {
		return React.createElement(
			Text,
			{ color: 'red' },
			`Error loading profiles: ${error}`
		);
	}

	if (profiles.length === 0) {
		return React.createElement(
			Box,
			{ flexDirection: 'column' },
			React.createElement(
				Text,
				{ color: 'yellow' },
				'No profiles found.'
			),
			React.createElement(Newline),
			React.createElement(
				Text,
				{ bold: true },
				'Profile search locations:'
			),
			React.createElement(
				Box,
				{ marginLeft: 2, flexDirection: 'column' },
				React.createElement(Text, null, 'Project: .copytree/'),
				React.createElement(Text, null, 'User: ~/.copytree/profiles/'),
				React.createElement(Text, null, 'Built-in: (included with copytree)')
			)
		);
	}

	// Group profiles by source
	const grouped = {
		'built-in': [],
		'user': [],
		'project': []
	};

	profiles.forEach(profile => {
		grouped[profile.source].push(profile);
	});

	return React.createElement(
		Box,
		{ flexDirection: 'column' },
		React.createElement(
			Text,
			{ bold: true, color: 'yellow' },
			'Available Profiles:'
		),
		React.createElement(Newline),
		React.createElement(ProfileGroup, {
			title: 'Built-in Profiles',
			profiles: grouped['built-in'],
			color: 'blue'
		}),
		React.createElement(ProfileGroup, {
			title: 'User Profiles',
			profiles: grouped['user'],
			color: 'green'
		}),
		React.createElement(ProfileGroup, {
			title: 'Project Profiles',
			profiles: grouped['project'],
			color: 'magenta'
		}),
		React.createElement(
			Text,
			{ dimColor: true },
			'To use a profile: copytree --profile <name>'
		),
		options.verbose && React.createElement(ProfileDetails, { profiles })
	);
};

module.exports = ProfileListView;