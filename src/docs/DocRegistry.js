import fs from 'fs-extra';
import path from 'path';
import YAML from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DocRegistry - Centralized documentation discovery and assembly
 *
 * Manages sections, groups, and tasks from docs/manifest.yaml
 * Falls back to auto-indexing if manifest doesn't exist
 */
export class DocRegistry {
  constructor(docsDir) {
    this.docsDir = docsDir || path.join(__dirname, '../../docs');
    this.manifest = null;
    this.sectionMap = new Map();
    this.groupMap = new Map();
    this.taskMap = new Map();
  }

  /**
   * Load the manifest and index all entities
   */
  async load() {
    const manifestPath = path.join(this.docsDir, 'manifest.yaml');

    if (await fs.pathExists(manifestPath)) {
      const raw = await fs.readFile(manifestPath, 'utf8');
      this.manifest = YAML.load(raw);
    } else {
      // Fallback: auto-index from filesystem
      this.manifest = await this.autoIndex();
    }

    this.indexById();
    return this;
  }

  /**
   * Create indices for fast lookup
   */
  indexById() {
    // Index sections
    (this.manifest.sections || []).forEach((s) => {
      this.sectionMap.set(s.id, s);
    });

    // Index groups
    (this.manifest.groups || []).forEach((g) => {
      this.groupMap.set(g.id, g);
    });

    // Index tasks
    (this.manifest.tasks || []).forEach((t) => {
      this.taskMap.set(t.id, t);
    });
  }

  /**
   * Auto-index documentation files when manifest doesn't exist
   * Walks the docs directory and creates sections from markdown files
   */
  async autoIndex() {
    const sections = [];

    // Walk common doc directories
    const dirs = ['profiles', 'cli', 'usage', 'technical'];

    for (const dir of dirs) {
      const dirPath = path.join(this.docsDir, dir);
      if (await fs.pathExists(dirPath)) {
        const files = await fs.readdir(dirPath);

        for (const file of files) {
          if (file.endsWith('.md')) {
            const id = `${dir}/${path.basename(file, '.md')}`;
            const filePath = path.join(dirPath, file);
            const summary = await this.extractSummary(filePath);
            const title = this.titleFromFilename(file);

            sections.push({
              id,
              title,
              summary,
              files: [`${dir}/${file}`],
              tags: [dir],
            });
          }
        }
      }
    }

    return {
      version: 1,
      sections,
      groups: [],
      tasks: [],
    };
  }

  /**
   * Extract summary from markdown file
   * Looks for Description:/Summary: or uses first non-header line
   */
  async extractSummary(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i].trim();

        // Look for explicit description/summary
        if (line.startsWith('Description:') || line.startsWith('Summary:')) {
          return line.split(':')[1].trim();
        }

        // Use first non-empty, non-header line after title
        if (i > 0 && !line.startsWith('#') && line.length > 0 && line.length < 200) {
          return line;
        }
      }

      return 'Documentation available';
    } catch (error) {
      return 'Documentation available';
    }
  }

  /**
   * Convert filename to title
   */
  titleFromFilename(filename) {
    return path
      .basename(filename, '.md')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * List available sections, groups, and/or tasks
   * @param {string} kind - 'all', 'sections', 'groups', or 'tasks'
   */
  list(kind = 'all') {
    const result = {};

    if (['all', 'sections'].includes(kind)) {
      result.sections = this.manifest.sections || [];
    }

    if (['all', 'groups'].includes(kind)) {
      result.groups = this.manifest.groups || [];
    }

    if (['all', 'tasks'].includes(kind)) {
      result.tasks = this.manifest.tasks || [];
    }

    return result;
  }

  /**
   * Get a section by ID
   */
  getSection(id) {
    return this.sectionMap.get(id);
  }

  /**
   * Get a group by ID
   */
  getGroup(id) {
    return this.groupMap.get(id);
  }

  /**
   * Get a task by ID
   */
  getTask(id) {
    return this.taskMap.get(id);
  }

  /**
   * Resolve sections from multiple sources
   * @param {Object} options
   * @param {string[]} options.sections - Section IDs
   * @param {string[]} options.groups - Group IDs
   * @param {string} options.task - Task ID
   * @returns {Object[]} Resolved section objects in order
   */
  resolveSections({ sections = [], groups = [], task = null }) {
    const sectionIds = new Set();
    const orderedIds = [];

    // Add explicit sections
    sections.forEach((id) => {
      if (!sectionIds.has(id)) {
        sectionIds.add(id);
        orderedIds.push(id);
      }
    });

    // Add sections from groups
    groups.forEach((gid) => {
      const group = this.groupMap.get(gid);
      if (group && group.sections) {
        group.sections.forEach((id) => {
          if (!sectionIds.has(id)) {
            sectionIds.add(id);
            orderedIds.push(id);
          }
        });
      }
    });

    // Add sections from task
    if (task) {
      const t = this.taskMap.get(task);
      if (t && t.groups) {
        t.groups.forEach((gid) => {
          const group = this.groupMap.get(gid);
          if (group && group.sections) {
            group.sections.forEach((id) => {
              if (!sectionIds.has(id)) {
                sectionIds.add(id);
                orderedIds.push(id);
              }
            });
          }
        });
      }
    }

    // Resolve to actual section objects
    return orderedIds.map((id) => this.sectionMap.get(id)).filter(Boolean);
  }

  /**
   * Assemble documentation content from resolved sections
   * @param {Object[]} sections - Array of section objects
   * @param {Object} options
   * @param {boolean} options.includeTaskInfo - Include task intro/checklist
   * @param {string} options.taskId - Task ID for context
   * @returns {string} Assembled markdown content
   */
  async assemble(sections, options = {}) {
    const parts = [];

    // Add task intro if requested
    if (options.includeTaskInfo && options.taskId) {
      const task = this.taskMap.get(options.taskId);
      if (task && task.extra) {
        parts.push(`# ${task.title}\n\n${task.extra.intro}\n`);

        if (task.extra.checklist) {
          parts.push('\n## Checklist\n');
          task.extra.checklist.forEach((item) => {
            parts.push(`- [ ] ${item}\n`);
          });
          parts.push('\n---\n');
        }
      }
    }

    // Add each section
    for (const section of sections) {
      const content = await this.concatFiles(section.files);
      parts.push(`# ${section.title}\n\n${content}\n`);
    }

    return parts.join('\n---\n\n');
  }

  /**
   * Concatenate multiple documentation files
   */
  async concatFiles(relPaths) {
    const chunks = [];

    for (const rel of relPaths) {
      const fullPath = path.join(this.docsDir, rel);

      if (await fs.pathExists(fullPath)) {
        const content = await fs.readFile(fullPath, 'utf8');
        chunks.push(content);
      }
    }

    return chunks.join('\n\n');
  }

  /**
   * Get metadata about the registry
   * Useful for --meta output
   */
  getMetadata() {
    return {
      version: this.manifest.version,
      counts: {
        sections: this.manifest.sections?.length || 0,
        groups: this.manifest.groups?.length || 0,
        tasks: this.manifest.tasks?.length || 0,
      },
      sections:
        this.manifest.sections?.map((s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
          tags: s.tags,
          fileCount: s.files.length,
        })) || [],
      groups:
        this.manifest.groups?.map((g) => ({
          id: g.id,
          title: g.title,
          description: g.description,
          sectionCount: g.sections.length,
        })) || [],
      tasks:
        this.manifest.tasks?.map((t) => ({
          id: t.id,
          title: t.title,
          groups: t.groups,
        })) || [],
    };
  }
}

export default DocRegistry;
