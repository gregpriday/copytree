import React, { useEffect, useState } from 'react';

// Use dynamic import for ESM-only ink
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

import { useAppContext } from '../contexts/AppContext.js';

const ConfigSourceBadge = ({ source }) => {
  const getSourceColor = (source) => {
    if (source.startsWith('environment:')) return 'green';
    if (source === 'user-config') return 'yellow';
    if (source === 'default') return 'gray';
    return 'white';
  };

  const getSourceDisplay = (source) => {
    if (source.startsWith('environment:')) {
      return source.replace('environment:', 'env:');
    }
    return source;
  };

  return React.createElement(
    Text,
    { color: getSourceColor(source), dimColor: source === 'default' },
    `(${getSourceDisplay(source)})`
  );
};

const ConfigItem = ({ path, config, level = 0 }) => {
  const indent = '  '.repeat(level);
  const { value, source, type, redacted } = config;
  
  // Format value for display
  let displayValue = value;
  if (type === 'boolean') {
    displayValue = value ? 'true' : 'false';
  } else if (type === 'object' && Array.isArray(value)) {
    displayValue = `[${value.length} items]`;
  } else if (type === 'string') {
    displayValue = `"${value}"`;
  }

  const valueColor = redacted ? 'red' : 
                   type === 'boolean' ? (value ? 'green' : 'red') :
                   type === 'number' ? 'cyan' :
                   'white';

  return React.createElement(
    Box,
    { key: path },
    React.createElement(
      Text,
      null,
      `${indent}├── `,
      React.createElement(Text, { bold: true }, path.split('.').pop()),
      ': ',
      React.createElement(Text, { color: valueColor }, displayValue),
      ' ',
      React.createElement(ConfigSourceBadge, { source })
    )
  );
};

const ConfigSection = ({ sectionName, configs, showSectionHeader = true }) => {
  // Group configs by section
  const sectionConfigs = Object.entries(configs).filter(([path]) => 
    path.startsWith(sectionName + '.') || path === sectionName
  );

  if (sectionConfigs.length === 0) {
    return null;
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    showSectionHeader && React.createElement(
      Text,
      { bold: true, color: 'yellow' },
      `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} Configuration:`
    ),
    ...sectionConfigs.map(([path, config]) => 
      React.createElement(ConfigItem, { 
        key: path, 
        path, 
        config,
        level: showSectionHeader ? 0 : 0
      })
    )
  );
};

const ConfigSummary = ({ configs }) => {
  const sources = {};
  const totalConfigs = Object.keys(configs).length;
  
  // Count configs by source
  Object.values(configs).forEach(config => {
    const source = config.source;
    sources[source] = (sources[source] || 0) + 1;
  });

  return React.createElement(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    React.createElement(
      Text,
      { bold: true, color: 'cyan' },
      'Configuration Summary:'
    ),
    React.createElement(
      Text,
      null,
      `Total configuration values: ${totalConfigs}`
    ),
    ...Object.entries(sources).map(([source, count]) =>
      React.createElement(
        Text,
        { key: source },
        `  - ${source}: ${count} values`
      )
    )
  );
};

const ConfigInspectView = () => {
  const { options, updateState } = useAppContext();
  const [effectiveConfig, setEffectiveConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadEffectiveConfig = async () => {
      try {
        setLoading(true);
        const { config } = await import('../../config/ConfigManager.js');
        const configManager = config();
        
        // Wait for config to be loaded if not already
        if (Object.keys(configManager.config).length === 0) {
          await configManager.loadConfiguration();
        }

        const effectiveOptions = {
          redact: options.redact !== false, // Default to true unless explicitly disabled
          section: options.section || null
        };

        const effective = configManager.effective(effectiveOptions);
        setEffectiveConfig(effective);
      } catch (err) {
        setError(err.message);
        updateState({ error: err });
      } finally {
        setLoading(false);
      }
    };

    loadEffectiveConfig();
  }, [options, updateState]);

  if (loading) {
    return React.createElement(
      Box,
      null,
      React.createElement(
        Text,
        { color: 'yellow' },
        'Loading configuration...'
      )
    );
  }

  if (error) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { color: 'red', bold: true },
        '✗ Failed to load configuration'
      ),
      React.createElement(
        Text,
        { color: 'red' },
        error
      )
    );
  }

  if (!effectiveConfig || Object.keys(effectiveConfig).length === 0) {
    return React.createElement(
      Box,
      null,
      React.createElement(
        Text,
        { color: 'yellow' },
        'No configuration found'
      )
    );
  }

  // Handle different output formats
  if (options.format === 'json') {
    const jsonOutput = JSON.stringify(effectiveConfig, null, 2);
    return React.createElement(
      Box,
      null,
      React.createElement(
        Text,
        null,
        jsonOutput
      )
    );
  }

  // Default table format
  const sections = ['ai', 'app', 'cache', 'copytree', 'state'];
  const specificSection = options.section;

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Text,
      { bold: true, color: 'yellow' },
      specificSection ? 
        `Configuration Inspection (${specificSection} section):` :
        'Configuration Inspection:'
    ),
    React.createElement(Box, { marginTop: 1 }),
    
    // Show summary if not filtering by section
    !specificSection && React.createElement(ConfigSummary, { configs: effectiveConfig }),
    
    // Show configurations by section or all if specific section requested
    specificSection ? 
      React.createElement(ConfigSection, { 
        sectionName: specificSection, 
        configs: effectiveConfig,
        showSectionHeader: false
      }) :
      sections.map(sectionName =>
        React.createElement(ConfigSection, {
          key: sectionName,
          sectionName,
          configs: effectiveConfig,
          showSectionHeader: true
        })
      ),
    
    // Show legend
    React.createElement(Box, { marginTop: 1 }),
    React.createElement(
      Text,
      { color: 'gray', dimColor: true },
      'Legend: (default) = default config, (user-config) = user override, (env:VAR) = environment variable'
    )
  );
};

export default ConfigInspectView;