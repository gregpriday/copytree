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
import fs from 'fs-extra';
import path from 'path';
// Use dynamic import for ESM-only clipboardy inside async contexts

const TopicsList = ({ topics }) => {
  if (!topics || topics.length === 0) {
    return null;
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'yellow' }, 'Available Documentation Topics:'),
    React.createElement(Box, { marginTop: 1 }, null),
    ...topics.map((section) =>
      React.createElement(
        Box,
        { key: section.title, flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, { color: section.color, bold: true }, section.title + ':'),
        ...section.items.map((item) =>
          React.createElement(
            Box,
            { key: item.name, marginLeft: 2 },
            React.createElement(Text, { bold: true }, item.name.padEnd(20)),
            React.createElement(Text, { dimColor: true }, item.description),
          ),
        ),
      ),
    ),
    React.createElement(
      Text,
      { dimColor: true, marginTop: 1 },
      'Usage: copytree copy:docs --topic <name>',
    ),
  );
};

const DocContent = ({ content, stats, action }) => {
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, { color: 'green', bold: true }, `✓ ${action}`),
    stats &&
      React.createElement(
        Text,
        { dimColor: true },
        `${stats.lines} lines, ${stats.characters} characters`,
      ),
  );
};

const DocsView = () => {
  const { options, updateState } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const runDocsCommand = async () => {
      try {
        const docsDir = path.join(process.cwd(), 'docs');
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
          } else if (options.display) {
            // Display to console
            console.log(docContent);
            action = 'Documentation displayed';
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
    return React.createElement(Text, { color: 'blue' }, 'Loading documentation...');
  }

  if (error) {
    return React.createElement(Text, { color: 'red' }, `Error: ${error}`);
  }

  if (topics.length > 0) {
    return React.createElement(TopicsList, { topics });
  }

  if (result) {
    return React.createElement(DocContent, {
      content: result.content,
      stats: result.stats,
      action: result.action,
    });
  }

  return React.createElement(Text, { color: 'yellow' }, 'No documentation found');
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
      { name: 'ignore-files', description: '.copytreeignore and .copytreeinclude usage' },
      { name: 'all', description: 'All documentation combined (recommended for AI agents)' },
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
    profiles: `# CopyTree Profile System

## Overview

Profiles in CopyTree allow you to create reusable configurations for different project types. They control which files are included, how they're transformed, and what output format is used.

## Profile Structure

\`\`\`yaml
name: my-profile
description: Description of what this profile does
version: 1.0.0

# File selection
include:
  - "src/**/*"
  - "*.json"
exclude:
  - "**/node_modules/**"
  - "**/*.test.js"

# Options
options:
  includeHidden: false
  followSymlinks: false
  respectGitignore: true
  maxFileSize: 10485760  # 10MB
  maxFileCount: 10000

# Transformers
transformers:
  markdown:
    enabled: true
    options:
      mode: strip
  images:
    enabled: true
    options:
      mode: description

# Output settings
output:
  format: xml
  includeMetadata: true
  addLineNumbers: false
\`\`\`

## Using Profiles

\`\`\`bash
# Use a built-in profile
copytree --profile laravel

# Use a custom profile
copytree --profile ./my-profile.yml

# Create a new profile
copytree profile:create
\`\`\`

## Profile Locations

Profiles are searched in this order:
1. Project directory: \`.copytree/\`
2. User directory: \`~/.copytree/profiles/\`
3. Built-in profiles

## Built-in Profiles

- **default**: General-purpose profile
- **laravel**: Optimized for Laravel projects
- **sveltekit**: Optimized for SvelteKit projects
- **minimal**: Minimal output with key files only
`,

    transformers: `# CopyTree Transformers

## Overview

Transformers modify file content before it's included in the output. They can compress, summarize, or convert files to more suitable formats.

## Available Transformers

### Text Transformers

1. **FileLoader** - Default transformer, loads file content as-is
2. **Markdown** - Strip formatting, links, or convert to plain text
3. **CSV** - Show preview rows or full content
4. **FirstLines** - Show only first N lines of files
5. **HTMLStripper** - Convert HTML to plain text
6. **MarkdownLinkStripper** - Remove links from markdown

### AI-Powered Transformers

1. **AISummary** - Generate summaries using AI
2. **FileSummary** - Summarize any text file
3. **UnitTestSummary** - Specialized summaries for test files
4. **ImageDescription** - Describe images using vision AI
5. **SvgDescription** - Analyze and describe SVG files

### Document Transformers

1. **PDF** - Extract text from PDF files
2. **DocumentToText** - Convert Word/ODT to text (requires Pandoc)

### Binary Transformers

1. **Binary** - Replace binary content with placeholder
2. **Image** - Handle images (placeholder or AI description)

## Configuring Transformers

In profiles:
\`\`\`yaml
transformers:
  markdown:
    enabled: true
    options:
      mode: strip  # strip, plain, or original
  
  images:
    enabled: true
    options:
      mode: description  # placeholder or description
  
  firstlines:
    enabled: true
    options:
      lineCount: 50
\`\`\`

## Custom Transformers

Create custom transformers by extending BaseTransformer:

\`\`\`javascript
class MyTransformer extends BaseTransformer {
  async doTransform(file) {
    // Transform logic
    return {
      ...file,
      content: transformedContent,
      transformed: true
    };
  }
}
\`\`\`
`,

    pipeline: `# CopyTree Pipeline Architecture

## Overview

The pipeline is the core processing engine that transforms a directory into structured output. It uses a series of stages to discover, filter, transform, and format files.

## Pipeline Stages

### 1. FileDiscoveryStage
Discovers all files in the target directory based on include patterns.

### 2. ProfileFilterStage  
Applies profile-based filtering rules (include/exclude patterns).

### 3. GitFilterStage
Filters files based on Git status (modified, staged, etc.) if requested.

### 4. AIFilterStage
Uses AI to intelligently filter files based on natural language queries.

### 5. ExternalSourceStage
Includes files from external sources (GitHub repos, other directories).

### 6. DeduplicateFilesStage
Removes duplicate files based on content hash.

### 7. SortFilesStage
Sorts files by path, size, date, or other criteria.

### 8. TransformStage
Applies transformers to modify file content.

### 9. CharLimitStage
Ensures output stays within character limits.

### 10. OutputFormattingStage
Formats the final output (XML, JSON, or tree format).

## Creating Custom Stages

\`\`\`javascript
class MyStage extends Stage {
  async process(input) {
    const { files } = input;
    
    // Process files
    const processedFiles = files.map(file => {
      // Stage logic
      return modifiedFile;
    });
    
    return {
      ...input,
      files: processedFiles
    };
  }
}
\`\`\`

## Pipeline Configuration

Configure pipeline in profiles:
\`\`\`yaml
pipeline:
  stages:
    - FileDiscoveryStage
    - ProfileFilterStage
    - MyCustomStage
    - TransformStage
    - OutputFormattingStage
\`\`\`
`,

    configuration: `# CopyTree Configuration Guide

## Configuration Hierarchy

CopyTree uses a hierarchical configuration system:

1. Default configuration (built-in)
2. User configuration (~/.copytree/config.yml)
3. Project configuration (.copytree/config.yml)
4. Environment variables
5. Command-line arguments

## Configuration File Format

\`\`\`yaml
# ~/.copytree/config.yml

# Application settings
app:
  debug: false
  quiet: false
  colors: true

# Cache settings
cache:
  enabled: true
  directory: ~/.copytree/cache
  transformations:
    enabled: true
    ttl: 86400  # 24 hours

# AI settings
ai:
  provider: gemini
  model: gemini-2.5-flash
  temperature: 0.3
  maxTokens: 1000

# Output defaults
output:
  format: xml
  prettyPrint: true
  includeMetadata: true
  
# Git integration
git:
  respectGitignore: true
  includeUntracked: false
\`\`\`

## Environment Variables

\`\`\`bash
# Paths
export COPYTREE_CONFIG=~/custom-config.yml
export COPYTREE_CACHE_DIR=~/custom-cache

# Behavior
export COPYTREE_DEBUG=true
export COPYTREE_NO_COLOR=true
\`\`\`

## Validating Configuration

\`\`\`bash
# Validate all configuration
copytree config:validate

# Validate specific section
copytree config:validate --section ai
\`\`\`

## Common Configuration Patterns

### For Large Projects
\`\`\`yaml
output:
  charLimit: 500000
  
options:
  maxFileSize: 1048576  # 1MB per file
  maxFileCount: 5000
\`\`\`

### For Documentation
\`\`\`yaml
transformers:
  markdown:
    enabled: true
    options:
      mode: original
      
output:
  format: markdown
\`\`\`

### For Code Review
\`\`\`yaml
git:
  filterMode: modified
  
transformers:
  firstlines:
    enabled: true
    options:
      lineCount: 100
\`\`\`
`,

    'ignore-files': `# .copytreeignore and .copytreeinclude Files

## Overview

CopyTree provides two powerful files for controlling which files are included in your output:

- **.copytreeignore** - Exclude files and directories (similar to .gitignore)
- **.copytreeinclude** - Force-include files that would otherwise be excluded (highest precedence)

## .copytreeignore

Place a \`.copytreeignore\` file in your project root to exclude files:

\`\`\`bash
# .copytreeignore
node_modules/
dist/
*.log
.env
coverage/
\`\`\`

Uses the same syntax as \`.gitignore\`: wildcards (\`*\`), recursive patterns (\`**\`), negation (\`!\`).

## .copytreeinclude

Force-include files that would otherwise be excluded. **Highest precedence** - overrides all other exclusion rules:

\`\`\`bash
# .copytreeinclude
.example/**
.env.example
config/**
docs/**/*.md
\`\`\`

### Common Use Cases

1. **Hidden files**: Include hidden directories like \`.example/\`
2. **Environment files**: Include \`.env.example\` for documentation
3. **Override exclusions**: Include specific files from excluded directories
4. **Git context**: Force-include README/config when using \`--git-modified\`

### Precedence (highest to lowest)

1. \`.copytreeinclude\` + CLI \`--always\` + profile \`always\` (highest)
2. Git filters (\`--git-modified\`, \`--git-branch\`)
3. Profile \`filter\` patterns
4. Profile \`exclude\` patterns
5. \`.copytreeignore\`
6. \`.gitignore\` (when \`respectGitignore: true\`)

## Quick Examples

\`\`\`bash
# Use ignore/include files
copytree  # Respects .copytreeignore and .copytreeinclude

# Force-include via CLI
copytree --always ".example/**" --always ".env"

# Combine with git filters
copytree --git-modified --always "README.md"

# Preview before running
copytree --dry-run
\`\`\`
`,
  };

  // Build the 'all' documentation by combining all topics
  docs.all = `# CopyTree Complete Documentation

This document contains all essential CopyTree documentation for quick reference.

${docs.profiles}

---

${docs.transformers}

---

${docs.pipeline}

---

${docs.configuration}

---

# .copytreeignore and .copytreeinclude Files

## Overview

CopyTree provides two powerful files for controlling which files are included:

- **.copytreeignore** - Exclude files (similar to .gitignore)
- **.copytreeinclude** - Force-include files (highest precedence)

## .copytreeignore

\`\`\`bash
# .copytreeignore
node_modules/
dist/
*.log
.env
coverage/
\`\`\`

## .copytreeinclude

\`\`\`bash
# .copytreeinclude
.example/**
.env.example
config/**
\`\`\`

### Precedence (highest to lowest)

1. \`.copytreeinclude\` + \`--always\` + profile \`always\` (highest)
2. Git filters (\`--git-modified\`, \`--git-branch\`)
3. Profile \`filter\` and \`exclude\` patterns
4. \`.copytreeignore\`
5. \`.gitignore\`

---

## Common Commands Reference

\`\`\`bash
# Copy to clipboard (default XML format)
copytree

# Copy as file reference (useful for LLMs)
copytree -r

# Display tree structure only
copytree -t

# Save to file
copytree -o output.xml

# Git-modified files only
copytree -m

# Compare with branch
copytree -c main

# Use custom profile
copytree -p my-profile

# View this documentation
copytree copy:docs --topic all --display
\`\`\`
`;

  return docs[topic] || null;
}

export default DocsView;
