import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import clipboardy from 'clipboardy';
import { logger } from '../utils/logger.js';
import { CommandError } from '../utils/errors.js';
import { DocRegistry } from '../docs/DocRegistry.js';
import YAML from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper: Convert option value to array
 */
function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Copy docs command - Copy framework/library documentation
 * Supports sections, groups, tasks, and legacy topic mode
 */
async function copyDocsCommand(options) {
  try {
    const docsDir = path.join(__dirname, '../../docs');
    const registry = await new DocRegistry(docsDir).load();

    // Handle --list flag (no content, just listing)
    if (options.list) {
      return await handleList(registry, options);
    }

    // Handle new section/group/task flags
    if (options.section || options.group || options.task) {
      return await handleStructured(registry, options);
    }

    // Back-compat: handle legacy --topic flag
    if (options.topic) {
      return await handleLegacyTopic(docsDir, options);
    }

    // No flags: list available items
    return await handleList(registry, { ...options, list: 'all' });
  } catch (error) {
    logger.error('Copy docs command failed', {
      error: error.message,
      stack: error.stack,
    });

    if (error instanceof CommandError) {
      throw error;
    }

    throw new CommandError(`Failed to copy documentation: ${error.message}`, 'copy:docs');
  }
}

/**
 * Handle --list flag
 * Shows available sections, groups, and/or tasks
 */
async function handleList(registry, options) {
  const kind = typeof options.list === 'string' ? options.list : 'all';
  const data = registry.list(kind);

  let output;

  if (options.meta) {
    // Output metadata in structured format
    const metadata = registry.getMetadata();
    const filtered = {};

    if (['all', 'sections'].includes(kind)) filtered.sections = metadata.sections;
    if (['all', 'groups'].includes(kind)) filtered.groups = metadata.groups;
    if (['all', 'tasks'].includes(kind)) filtered.tasks = metadata.tasks;

    if (options.meta === 'json') {
      output = JSON.stringify(filtered, null, 2);
    } else if (options.meta === 'yaml') {
      output = YAML.dump(filtered);
    } else {
      throw new CommandError(`Invalid meta format: ${options.meta}. Use 'json' or 'yaml'`, 'copy:docs');
    }
  } else {
    // Human-readable listing
    output = formatHumanList(data);
  }

  return await routeOutput(output, {
    ...options,
    stats: {
      lines: output.split('\n').length,
      characters: output.length,
    },
    action: 'Documentation list displayed',
  });
}

/**
 * Format listing for human consumption
 */
function formatHumanList(data) {
  const parts = [];

  // Header with prominent display flag mention
  parts.push('# CopyTree Documentation\n');
  parts.push('> **Tip for AI agents**: Use `--display` to read documentation directly in the terminal\n');
  parts.push('---\n');

  // Quick start examples
  parts.push('## Quick Start\n');
  parts.push('```bash');
  parts.push('# Read all documentation (recommended for AI agents)');
  parts.push('copytree copy:docs --list --display');
  parts.push('');
  parts.push('# Copy a task bundle to work on a specific task');
  parts.push('copytree copy:docs --task make-copytreeignore --display');
  parts.push('');
  parts.push('# Copy to clipboard (default)');
  parts.push('copytree copy:docs --task author-custom-profile');
  parts.push('```\n');

  // Tasks section (most important for users)
  if (data.tasks && data.tasks.length > 0) {
    parts.push('## Tasks (Curated Documentation Bundles)\n');
    parts.push('Tasks provide all documentation needed for specific workflows:\n');
    data.tasks.forEach(t => {
      parts.push(`### ${t.id}`);
      parts.push(`**${t.title}**`);
      if (t.extra && t.extra.intro) {
        parts.push(`${t.extra.intro}`);
      }
      parts.push(`\`\`\`bash`);
      parts.push(`copytree copy:docs --task ${t.id} --display`);
      parts.push(`\`\`\``);
      parts.push('');
    });
  }

  // Groups section
  if (data.groups && data.groups.length > 0) {
    parts.push('## Groups (Documentation Bundles)\n');
    parts.push('Groups combine related documentation sections:\n');
    data.groups.forEach(g => {
      parts.push(`### ${g.id}`);
      parts.push(`**${g.title}**`);
      parts.push(`${g.description}`);
      parts.push(`\`\`\`bash`);
      parts.push(`copytree copy:docs --group ${g.id} --display`);
      parts.push(`\`\`\``);
      parts.push('');
    });
  }

  // Sections section
  if (data.sections && data.sections.length > 0) {
    parts.push('## Sections (Individual Documentation Files)\n');
    parts.push('Individual documentation sections:\n');
    data.sections.forEach(s => {
      parts.push(`### ${s.id}`);
      parts.push(`**${s.title}** - ${s.summary}`);
      if (s.tags && s.tags.length > 0) {
        parts.push(`Tags: ${s.tags.join(', ')}`);
      }
      parts.push(`\`\`\`bash`);
      parts.push(`copytree copy:docs --section ${s.id} --display`);
      parts.push(`\`\`\``);
      parts.push('');
    });
  }

  if (parts.length === 0) {
    return 'No documentation items found.';
  }

  // Additional options
  parts.push('\n## Additional Options\n');
  parts.push('```bash');
  parts.push('# List specific types');
  parts.push('copytree copy:docs --list tasks');
  parts.push('copytree copy:docs --list groups');
  parts.push('copytree copy:docs --list sections');
  parts.push('');
  parts.push('# Get metadata in JSON (for tools)');
  parts.push('copytree copy:docs --list tasks --meta json');
  parts.push('');
  parts.push('# Combine multiple sections');
  parts.push('copytree copy:docs --section profiles/overview --section transformers/reference --display');
  parts.push('');
  parts.push('# Save to file instead of clipboard');
  parts.push('copytree copy:docs --task make-copytreeignore -o docs-output.md');
  parts.push('```\n');

  return parts.join('\n');
}

/**
 * Handle structured documentation requests (section/group/task)
 */
async function handleStructured(registry, options) {
  const sections = registry.resolveSections({
    sections: toArray(options.section),
    groups: toArray(options.group),
    task: options.task || null,
  });

  if (sections.length === 0) {
    throw new CommandError(
      'No sections resolved from provided flags. Check IDs and try again.',
      'copy:docs'
    );
  }

  // Assemble content
  const content = await registry.assemble(sections, {
    includeTaskInfo: !!options.task,
    taskId: options.task,
  });

  // Add summary header
  const summary = buildSummaryHeader(sections, options);
  const fullContent = `${summary}\n\n${content}`;

  return await routeOutput(fullContent, {
    ...options,
    stats: {
      lines: fullContent.split('\n').length,
      characters: fullContent.length,
      sectionCount: sections.length,
    },
    action: buildActionMessage(sections, options),
  });
}

/**
 * Build summary header for structured docs
 */
function buildSummaryHeader(sections, options) {
  const parts = [`# CopyTree Documentation`];

  if (options.task) {
    parts.push(`\n> Task: **${options.task}**`);
  } else if (options.group && toArray(options.group).length > 0) {
    parts.push(`\n> Groups: **${toArray(options.group).join(', ')}**`);
  }

  parts.push(`\n> Sections included: ${sections.map(s => s.id).join(', ')}`);
  parts.push(`\n---`);

  return parts.join('\n');
}

/**
 * Build action message for output
 */
function buildActionMessage(sections, options) {
  if (options.task) {
    return `Task bundle '${options.task}' (${sections.length} sections)`;
  } else if (options.group) {
    const groups = toArray(options.group);
    return `Group${groups.length > 1 ? 's' : ''} '${groups.join(', ')}' (${sections.length} sections)`;
  } else {
    return `${sections.length} section${sections.length > 1 ? 's' : ''}`;
  }
}

/**
 * Handle legacy --topic flag (backwards compatibility)
 */
async function handleLegacyTopic(docsDir, options) {
  const docContent = await loadDocumentation(docsDir, options.topic);

  if (!docContent) {
    throw new CommandError(`Documentation not found for topic: ${options.topic}`, 'copy:docs');
  }

  return await routeOutput(docContent, {
    ...options,
    stats: {
      lines: docContent.split('\n').length,
      characters: docContent.length,
    },
    action: `Documentation for "${options.topic}"`,
  });
}

/**
 * Route output to the appropriate destination
 * Handles file, clipboard, or display
 */
async function routeOutput(content, options) {
  const stats = options.stats || {
    lines: content.split('\n').length,
    characters: content.length,
  };

  let action = options.action || 'Documentation';

  // Handle output routing
  if (options.output) {
    // Write to file
    await fs.writeFile(options.output, content, 'utf8');
    action = `${action} written to ${options.output}`;
  } else if (options.display) {
    // Display to console (UI will handle)
    action = `${action} displayed`;
  } else if (options.clipboard !== false) {
    // Copy to clipboard (default)
    await clipboardy.write(content);
    action = `${action} copied to clipboard`;
  } else {
    action = `${action} displayed`;
  }

  // Return result for UI
  return {
    content,
    stats,
    action,
  };
}

/**
 * Load documentation for a topic (legacy/back-compat)
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
 * Get built-in documentation (legacy topics)
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
# API Keys
export GEMINI_API_KEY=your-key-here
export OPENAI_API_KEY=your-key-here

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

export default copyDocsCommand;
