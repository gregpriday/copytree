const React = require('react');
const { useEffect, useState } = React;
const { useAppContext } = require('../contexts/AppContext.js');
const fs = require('fs-extra');
const path = require('path');
// Use dynamic import for ESM-only clipboardy inside async contexts (no top-level require)

const TopicsList = ({ topics, renderInk }) => {
  if (!topics || topics.length === 0) {
    return null;
  }

  return React.createElement(
    renderInk.Box,
    { flexDirection: 'column' },
    React.createElement(
      renderInk.Text,
      { bold: true, color: 'yellow' },
      'Available Documentation Topics:',
    ),
    React.createElement(renderInk.Box, { marginTop: 1 }, null),
    ...topics.map((section) => 
      React.createElement(
        renderInk.Box,
        { key: section.title, flexDirection: 'column', marginBottom: 1 },
        React.createElement(
          renderInk.Text,
          { color: section.color, bold: true },
          section.title + ':',
        ),
        ...section.items.map((item) =>
          React.createElement(
            renderInk.Box,
            { key: item.name, marginLeft: 2 },
            React.createElement(
              renderInk.Text,
              { bold: true },
              item.name.padEnd(20),
            ),
            React.createElement(
              renderInk.Text,
              { dimColor: true },
              item.description,
            ),
          ),
        ),
      ),
    ),
    React.createElement(
      renderInk.Text,
      { dimColor: true, marginTop: 1 },
      'Usage: copytree copy:docs --topic <name>',
    ),
  );
};

const DocContent = ({ content, stats, action, renderInk }) => {
  return React.createElement(
    renderInk.Box,
    { flexDirection: 'column' },
    React.createElement(
      renderInk.Text,
      { color: 'green', bold: true },
      `✓ ${action}`,
    ),
    stats && React.createElement(
      renderInk.Text,
      { dimColor: true },
      `${stats.lines} lines, ${stats.characters} characters`,
    ),
  );
};

const DocsView = ({ renderInk }) => {
  const { options, updateState } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const runDocsCommand = async () => {
      try {
        const docsDir = path.join(__dirname, '../../../docs');
        const topic = options.topic;

        if (!topic) {
          // List available topics
          const availableTopics = await getAvailableTopics(docsDir);
          setTopics(availableTopics);
        } else {
          // Load and handle documentation
          const docContent = await loadDocumentation(docsDir, topic);
					
          if (!docContent) {
            throw new Error(`Documentation not found for topic: ${topic}`);
          }

          const stats = {
            lines: docContent.split('\n').length,
            characters: docContent.length,
          };

          // Handle output
          let action = '';
          if (options.output) {
            await fs.writeFile(options.output, docContent, 'utf8');
            action = `Documentation written to ${options.output}`;
          } else if (options.clipboard !== false) {
            // Dynamically import ESM-only clipboardy inside async function
            const { default: clipboardy } = await import('clipboardy');
            await clipboardy.write(docContent);
            action = `Documentation for "${topic}" copied to clipboard`;
          } else {
            action = 'Documentation displayed';
          }

          setResult({ content: docContent, stats, action });
        }
      } catch (err) {
        setError(err.message);
        updateState({ error: err });
      } finally {
        setLoading(false);
      }
    };

    runDocsCommand();
  }, [options, updateState]);

  if (loading) {
    return React.createElement(
      renderInk.Text,
      { color: 'blue' },
      'Loading documentation...',
    );
  }

  if (error) {
    return React.createElement(
      renderInk.Text,
      { color: 'red' },
      `Error: ${error}`,
    );
  }

  if (topics.length > 0) {
    return React.createElement(TopicsList, { topics, renderInk });
  }

  if (result) {
    return React.createElement(DocContent, {
      content: result.content,
      stats: result.stats,
      action: result.action,
      renderInk,
    });
  }

  return React.createElement(
    renderInk.Text,
    { color: 'yellow' },
    'No documentation found',
  );
};

/**
 * Get available documentation topics
 */
async function getAvailableTopics(docsDir) {
  const topics = [];

  // Check for framework docs
  const frameworksDir = path.join(docsDir, 'frameworks');
  if (await fs.pathExists(frameworksDir)) {
    const frameworks = await fs.readdir(frameworksDir);
    const frameworkItems = [];
		
    for (const file of frameworks) {
      if (file.endsWith('.md')) {
        const name = path.basename(file, '.md');
        frameworkItems.push({
          name,
          description: 'Framework-specific documentation',
        });
      }
    }
		
    if (frameworkItems.length > 0) {
      topics.push({
        title: 'Frameworks',
        color: 'blue',
        items: frameworkItems,
      });
    }
  }

  // Check for topic docs
  const topicsDir = path.join(docsDir, 'topics');
  if (await fs.pathExists(topicsDir)) {
    const topicFiles = await fs.readdir(topicsDir);
    const topicItems = [];
		
    for (const file of topicFiles) {
      if (file.endsWith('.md')) {
        const name = path.basename(file, '.md');
        const description = await getTopicDescription(path.join(topicsDir, file));
        topicItems.push({ name, description });
      }
    }
		
    if (topicItems.length > 0) {
      topics.push({
        title: 'Topics',
        color: 'green',
        items: topicItems,
      });
    }
  }

  // Built-in docs
  topics.push({
    title: 'Built-in',
    color: 'magenta',
    items: [
      { name: 'profiles', description: 'Profile system documentation' },
      { name: 'transformers', description: 'File transformer documentation' },
      { name: 'pipeline', description: 'Pipeline architecture documentation' },
      { name: 'configuration', description: 'Configuration guide' },
    ],
  });

  return topics;
}

/**
 * Load documentation for a topic
 */
async function loadDocumentation(docsDir, topic) {
  // Check different locations
  const locations = [
    path.join(docsDir, 'frameworks', `${topic}.md`),
    path.join(docsDir, 'topics', `${topic}.md`),
    path.join(docsDir, `${topic}.md`),
  ];

  for (const location of locations) {
    if (await fs.pathExists(location)) {
      return await fs.readFile(location, 'utf8');
    }
  }

  // Check for built-in documentation
  return getBuiltInDocumentation(topic);
}

/**
 * Get description from topic file
 */
async function getTopicDescription(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');

    // Look for description in first few lines
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      if (line.startsWith('Description:') || line.startsWith('Summary:')) {
        return line.split(':')[1].trim();
      }
      // Also check for subtitle after title
      if (i === 1 && !line.startsWith('#') && line.length > 0) {
        return line;
      }
    }

    return 'Documentation available';
  } catch (error) {
    return 'Documentation available';
  }
}

/**
 * Get built-in documentation (same as original implementation)
 */
function getBuiltInDocumentation(topic) {
  const docs = {
    profiles: `# CopyTree Profile System\n\n## Overview\n\nProfiles in CopyTree allow you to create reusable configurations for different project types. They control which files are included, how they're transformed, and what output format is used.\n\n## Profile Structure\n\n\`\`\`yaml\nname: my-profile\ndescription: Description of what this profile does\nversion: 1.0.0\n\n# File selection\ninclude:\n  - "src/**/*"\n  - "*.json"\nexclude:\n  - "**/node_modules/**"\n  - "**/*.test.js"\n\n# Options\noptions:\n  includeHidden: false\n  followSymlinks: false\n  respectGitignore: true\n  maxFileSize: 10485760  # 10MB\n  maxFileCount: 10000\n\n# Transformers\ntransformers:\n  markdown:\n    enabled: true\n    options:\n      mode: strip\n  images:\n    enabled: true\n    options:\n      mode: description\n\n# Output settings\noutput:\n  format: xml\n  includeMetadata: true\n  addLineNumbers: false\n\`\`\`\n\n## Using Profiles\n\n\`\`\`bash\n# Use a built-in profile\ncopytree --profile laravel\n\n# Use a custom profile\ncopytree --profile ./my-profile.yml\n\n# Create a new profile\ncopytree profile:create\n\`\`\`\n\n## Profile Locations\n\nProfiles are searched in this order:\n1. Project directory: \`.copytree/\`\n2. User directory: \`~/.copytree/profiles/\`\n3. Built-in profiles\n\n## Built-in Profiles\n\n- **default**: General-purpose profile\n- **laravel**: Optimized for Laravel projects\n- **sveltekit**: Optimized for SvelteKit projects\n- **minimal**: Minimal output with key files only\n`,

    transformers: `# CopyTree Transformers\n\n## Overview\n\nTransformers modify file content before it's included in the output. They can compress, summarize, or convert files to more suitable formats.\n\n## Available Transformers\n\n### Text Transformers\n\n1. **FileLoader** - Default transformer, loads file content as-is\n2. **Markdown** - Strip formatting, links, or convert to plain text\n3. **CSV** - Show preview rows or full content\n4. **FirstLines** - Show only first N lines of files\n5. **HTMLStripper** - Convert HTML to plain text\n6. **MarkdownLinkStripper** - Remove links from markdown\n\n### AI-Powered Transformers\n\n1. **AISummary** - Generate summaries using AI\n2. **FileSummary** - Summarize any text file\n3. **UnitTestSummary** - Specialized summaries for test files\n4. **ImageDescription** - Describe images using vision AI\n5. **SvgDescription** - Analyze and describe SVG files\n\n### Document Transformers\n\n1. **PDF** - Extract text from PDF files\n2. **DocumentToText** - Convert Word/ODT to text (requires Pandoc)\n\n### Binary Transformers\n\n1. **Binary** - Replace binary content with placeholder\n2. **Image** - Handle images (placeholder or AI description)\n\n## Configuring Transformers\n\nIn profiles:\n\`\`\`yaml\ntransformers:\n  markdown:\n    enabled: true\n    options:\n      mode: strip  # strip, plain, or original\n  \n  images:\n    enabled: true\n    options:\n      mode: description  # placeholder or description\n  \n  firstlines:\n    enabled: true\n    options:\n      lineCount: 50\n\`\`\`\n\n## Custom Transformers\n\nCreate custom transformers by extending BaseTransformer:\n\n\`\`\`javascript\nclass MyTransformer extends BaseTransformer {\n  async doTransform(file) {\n    // Transform logic\n    return {\n      ...file,\n      content: transformedContent,\n      transformed: true\n    };\n  }\n}\n\`\`\`\n`,

    pipeline: `# CopyTree Pipeline Architecture\n\n## Overview\n\nThe pipeline is the core processing processing engine that transforms a directory into structured output. It uses a series of stages to discover, filter, transform, and format files.\n\n## Pipeline Stages\n\n### 1. FileDiscoveryStage\nDiscovers all files in the target directory based on include patterns.\n\n### 2. ProfileFilterStage  \nApplies profile-based filtering rules (include/exclude patterns).\n\n### 3. GitFilterStage\nFilters files based on Git status (modified, staged, etc.) if requested.\n\n### 4. AIFilterStage\nUses AI to intelligently filter files based on natural language queries.\n\n### 5. ExternalSourceStage\nIncludes files from external sources (GitHub repos, other directories).\n\n### 6. DeduplicateFilesStage\nRemoves duplicate files based on content hash.\n\n### 7. SortFilesStage\nSorts files by path, size, date, or other criteria.\n\n### 8. TransformStage\nApplies transformers to modify file content.\n\n### 9. CharLimitStage\nEnsures output stays within character limits.\n\n### 10. OutputFormattingStage\nFormats the final output (XML, JSON, or tree format).\n\n## Creating Custom Stages\n\n\`\`\`javascript\nclass MyStage extends Stage {\n  async process(input) {\n    const { files } = input;\n    \n    // Process files\n    const processedFiles = files.map(file => {\n      // Stage logic\n      return modifiedFile;\n    });\n    \n    return {\n      ...input,\n      files: processedFiles\n    };\n  }\n}\n\`\`\`\n\n## Pipeline Configuration\n\nConfigure pipeline in profiles:\n\`\`\`yaml\npipeline:\n  stages:\n    - FileDiscoveryStage\n    - ProfileFilterStage\n    - MyCustomStage\n    - TransformStage\n    - OutputFormattingStage\n\`\`\`\n`,

    configuration: `# CopyTree Configuration Guide\n\n## Configuration Hierarchy\n\nCopyTree uses a hierarchical configuration system:\n\n1. Default configuration (built-in)\n2. User configuration (~/.copytree/config.yml)\n3. Project configuration (.copytree/config.yml)\n4. Environment variables\n5. Command-line arguments\n\n## Configuration File Format\n\n\`\`\`yaml\n# ~/.copytree/config.yml\n\n# Application settings\napp:\n  debug: false\n  quiet: false\n  colors: true\n\n# Cache settings\ncache:\n  enabled: true\n  directory: ~/.copytree/cache\n  transformations:\n    enabled: true\n    ttl: 86400  # 24 hours\n\n# AI settings\nai:\n  provider: gemini\n  model: gemini-2.5-flash\n  temperature: 0.3\n  maxTokens: 1000\n\n# Output defaults\noutput:\n  format: xml\n  prettyPrint: true\n  includeMetadata: true\n  \n# Git integration\ngit:\n  respectGitignore: true\n  includeUntracked: false\n\`\`\`\n\n## Environment Variables\n\n\`\`\`bash\n# API Keys\nexport GEMINI_API_KEY=your-key-here\nexport OPENAI_API_KEY=your-key-here\n\n# Paths\nexport COPYTREE_CONFIG=~/custom-config.yml\nexport COPYTREE_CACHE_DIR=~/custom-cache\n\n# Behavior\nexport COPYTREE_DEBUG=true\nexport COPYTREE_NO_COLOR=true\n\`\`\`\n\n## Validating Configuration\n\n\`\`\`bash\n# Validate all configuration\ncopytree config:validate\n\n# Validate specific section\ncopytree config:validate --section ai\n\`\`\`\n\n## Common Configuration Patterns\n\n### For Large Projects\n\`\`\`yaml\noutput:\n  charLimit: 500000\n  \noptions:\n  maxFileSize: 1048576  # 1MB per file\n  maxFileCount: 5000\n\`\`\`\n\n### For Documentation\n\`\`\`yaml\ntransformers:\n  markdown:\n    enabled: true\n    options:\n      mode: original\n      \noutput:\n  format: markdown\n\`\`\`\n\n### For Code Review\n\`\`\`yaml\ngit:\n  filterMode: modified\n  \ntransformers:\n  firstlines:\n    enabled: true\n    options:\n      lineCount: 100\n\`\`\`\n`,
  };

  return docs[topic] || null;
}

module.exports = DocsView;