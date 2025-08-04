const React = require('react');
const { useEffect, useState } = React;
const { useAppContext } = require('../contexts/AppContext.js');
const ProfileLoader = require('../../profiles/ProfileLoader');

const ProfileGroup = ({ title, profiles, color, renderInk }) => {
  if (!profiles || profiles.length === 0) {
    return null;
  }

  return React.createElement(
    renderInk.Box,
    { flexDirection: 'column', marginBottom: 1 },
    React.createElement(
      renderInk.Text,
      { color, bold: true },
      title + ':',
    ),
    ...profiles.map((profile) =>
      React.createElement(
        renderInk.Box,
        { key: profile.name, marginLeft: 2 },
        React.createElement(
          renderInk.Text,
          { bold: true },
          profile.name.padEnd(20),
        ),
        React.createElement(
          renderInk.Text,
          { dimColor: true },
          profile.description || 'No description',
        ),
      ),
    ),
  );
};

const ProfileDetails = ({ profiles, renderInk }) => {
  return React.createElement(
    renderInk.Box,
    { flexDirection: 'column', marginTop: 1 },
    React.createElement(
      renderInk.Text,
      { bold: true, color: 'yellow' },
      'Profile Details:',
    ),
    React.createElement(renderInk.Newline),
    ...profiles.map((profile) =>
      React.createElement(
        renderInk.Box,
        { key: profile.name, flexDirection: 'column', marginBottom: 1 },
        React.createElement(
          renderInk.Text,
          { bold: true },
          profile.name + ':',
        ),
        React.createElement(
          renderInk.Box,
          { marginLeft: 2, flexDirection: 'column' },
          React.createElement(
            renderInk.Text,
            null,
            `Description: ${profile.description || 'No description'}`,
          ),
          React.createElement(
            renderInk.Text,
            null,
            `Source: ${profile.source}`,
          ),
          React.createElement(
            renderInk.Text,
            null,
            `Path: ${profile.path}`,
          ),
          profile.version && React.createElement(
            renderInk.Text,
            null,
            `Version: ${profile.version}`,
          ),
        ),
      ),
    ),
  );
};

const ProfileListView = ({ renderInk }) => {
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
      renderInk.Text,
      { color: 'blue' },
      'Loading profiles...',
    );
  }

  if (error) {
    return React.createElement(
      renderInk.Text,
      { color: 'red' },
      `Error loading profiles: ${error}`,
    );
  }

  if (profiles.length === 0) {
    return React.createElement(
      renderInk.Box,
      { flexDirection: 'column' },
      React.createElement(
        renderInk.Text,
        { color: 'yellow' },
        'No profiles found.',
      ),
      React.createElement(renderInk.Newline),
      React.createElement(
        renderInk.Text,
        { bold: true },
        'Profile search locations:',
      ),
      React.createElement(
        renderInk.Box,
        { marginLeft: 2, flexDirection: 'column' },
        React.createElement(renderInk.Text, null, 'Project: .copytree/'),
        React.createElement(renderInk.Text, null, 'User: ~/.copytree/profiles/'),
        React.createElement(renderInk.Text, null, 'Built-in: (included with copytree)'),
      ),
    );
  }

  // Group profiles by source
  const grouped = {
    'built-in': [],
    'user': [],
    'project': [],
  };

  profiles.forEach((profile) => {
    grouped[profile.source].push(profile);
  });

  return React.createElement(
    renderInk.Box,
    { flexDirection: 'column' },
    React.createElement(
      renderInk.Text,
      { bold: true, color: 'yellow' },
      'Available Profiles:',
    ),
    React.createElement(renderInk.Newline),
    React.createElement(ProfileGroup, {
      title: 'Built-in Profiles',
      profiles: grouped['built-in'],
      color: 'blue',
      renderInk,
    }),
    React.createElement(ProfileGroup, {
      title: 'User Profiles',
      profiles: grouped['user'],
      color: 'green',
      renderInk,
    }),
    React.createElement(ProfileGroup, {
      title: 'Project Profiles',
      profiles: grouped['project'],
      color: 'magenta',
      renderInk,
    }),
    React.createElement(
      renderInk.Text,
      { dimColor: true },
      'To use a profile: copytree --profile <name>',
    ),
    options.verbose && React.createElement(ProfileDetails, { profiles, renderInk }),
  );
};

module.exports = ProfileListView;