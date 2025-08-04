const React = require('react');
const { useEffect } = React;
const { AppProvider, useAppContext } = require('./contexts/AppContext.js');

// Use dynamic import for ESM-only ink in CommonJS context
let Text;
(async () => {
  try {
    const ink = await import('ink');
    Text = ink.Text;
  } catch (error) {
    // Defer error until first usage attempt
    Text = undefined;
  }
})().catch(() => {
  Text = undefined;
});

const CopyView = require('./components/CopyView.jsx');
const ProfileListView = require('./components/ProfileListView.jsx');
const ValidationView = require('./components/ValidationView.jsx');
const DocsView = require('./components/DocsView.jsx');
const InstallView = require('./components/InstallView.jsx');

const AppContent = () => {
  const { command, updateState } = useAppContext();

  const renderView = () => {
    if (!command) {
      // Ensure Text is available
      const TextComponent = Text || ((props) => React.createElement('div', null, props.children));
      return React.createElement(TextComponent, null, 'Loading...');
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
        type: 'cache',
      });
    case 'copy:docs':
      return React.createElement(DocsView);
    case 'install:copytree':
      return React.createElement(InstallView);
    default: {
      // Ensure Text is available
      const TextComponent = Text || ((props) => React.createElement('div', null, props.children));
      return React.createElement(TextComponent, { color: 'red' }, `Unknown command: ${command}`);
    }
    }
  };

  return renderView();
};

const App = ({ command, path, options }) => {
  return React.createElement(
    AppProvider,
    null,
    React.createElement(AppInitializer, { command, path, options }),
  );
};

const AppInitializer = ({ command, path, options }) => {
  const { updateState } = useAppContext();

  useEffect(() => {
    updateState({
      command,
      path: path || '.',
      options: options || {},
    });
  }, [command, path, options, updateState]);

  return React.createElement(AppContent);
};

module.exports = App;