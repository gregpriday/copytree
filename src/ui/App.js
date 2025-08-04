const React = require('react');
const { useEffect } = React;
const { AppProvider, useAppContext } = require('./contexts/AppContext.js');

const CopyView = require('./components/CopyView.jsx');
const ProfileListView = require('./components/ProfileListView.jsx');
const ValidationView = require('./components/ValidationView.jsx');
const DocsView = require('./components/DocsView.jsx');
const InstallView = require('./components/InstallView.jsx');

const AppContent = ({ renderInk }) => {
  const { command, updateState } = useAppContext();

  const renderView = () => {
    if (!command) {
      return React.createElement(renderInk.Text, null, 'Loading...');
    }

    switch (command) {
    case 'copy':
      return React.createElement(CopyView, { renderInk });
    case 'profile:list':
      return React.createElement(ProfileListView, { renderInk });
    case 'profile:validate':
    case 'config:validate':
      return React.createElement(ValidationView, { renderInk });
    case 'cache:clear':
      return React.createElement(ValidationView, { 
        successMessage: 'Cache cleared successfully',
        type: 'cache',
        renderInk,
      });
    case 'copy:docs':
      return React.createElement(DocsView, { renderInk });
    case 'install:copytree':
      return React.createElement(InstallView, { renderInk });
    default:
      return React.createElement(renderInk.Text, { color: 'red' }, `Unknown command: ${command}`);
    }
  };

  return renderView();
};

const App = ({ command, path, options, renderInk }) => {
  return React.createElement(
    AppProvider,
    null,
    React.createElement(AppInitializer, { command, path, options, renderInk }),
  );
};

const AppInitializer = ({ command, path, options, renderInk }) => {
  const { updateState } = useAppContext();

  useEffect(() => {
    updateState({
      command,
      path: path || '.',
      options: options || {},
      renderInk,
    });
  }, [command, path, options, updateState, renderInk]);

  return React.createElement(AppContent, { renderInk });
};

module.exports = App;