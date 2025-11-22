import React, { useEffect } from 'react';
import { AppProvider, useAppContext } from './contexts/AppContext.js';

// Use dynamic import for ESM-only ink
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

import CopyView from './components/CopyView.js';
import ValidationView from './components/ValidationView.js';
import ConfigInspectView from './components/ConfigInspectView.js';

const AppContent = () => {
  const { command, updateState } = useAppContext();

  const renderView = () => {
    if (!command) {
      // Ensure Text is available
      if (!Text) {
        return null; // Don't render anything if Text component isn't loaded yet
      }
      return React.createElement(Text, null, 'Loading...');
    }

    switch (command) {
      case 'copy':
        return React.createElement(CopyView);
      case 'config:validate':
        return React.createElement(ValidationView);
      case 'config:inspect':
        return React.createElement(ConfigInspectView);
      case 'cache:clear':
        return React.createElement(ValidationView, {
          successMessage: 'Cache cleared successfully',
          type: 'cache',
        });
      default: {
        // Ensure Text is available
        if (!Text) {
          return null; // Don't render anything if Text component isn't loaded yet
        }
        return React.createElement(Text, { color: 'red' }, `Unknown command: ${command}`);
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

export default App;
