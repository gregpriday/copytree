const BaseTransformer = require('../BaseTransformer');
const marked = require('marked');

/**
 * Markdown transformer
 * Can strip markdown formatting or convert to HTML
 */
class MarkdownTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Transforms markdown files by stripping formatting or converting to HTML';
    this.supportedExtensions = ['.md', '.markdown', '.mdown', '.mkd'];
    this.mode = options.mode || 'strip'; // 'strip' or 'html'
  }

  async doTransform(file) {
    // First load the content if not already loaded
    let content = file.content;
    
    if (content === undefined && file.absolutePath) {
      const fs = require('fs-extra');
      content = await fs.readFile(file.absolutePath, 'utf8');
    }

    if (!content || typeof content !== 'string') {
      return {
        ...file,
        content: content || '',
        transformed: false,
        transformedBy: this.constructor.name,
      };
    }

    let transformedContent;
    
    switch (this.mode) {
    case 'html':
      transformedContent = this.convertToHtml(content);
      break;
    case 'strip':
    default:
      transformedContent = this.stripMarkdown(content);
      break;
    }

    return {
      ...file,
      content: transformedContent,
      originalContent: content,
      transformed: true,
      transformedBy: this.constructor.name,
      transformMode: this.mode,
    };
  }

  /**
   * Strip markdown formatting
   * @param {string} content - Markdown content
   * @returns {string} Plain text
   */
  stripMarkdown(content) {
    let text = content;

    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, '');

    // Remove images
    text = text.replace(/!\[.*?\]\(.*?\)/g, '');

    // Remove links but keep text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove emphasis (bold, italic)
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');

    // Remove code blocks
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`([^`]+)`/g, '$1');

    // Remove blockquotes
    text = text.replace(/^\s*>+\s?/gm, '');

    // Remove horizontal rules
    text = text.replace(/^(-{3,}|_{3,}|\*{3,})$/gm, '');

    // Remove list markers
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');

    // Remove heading markers
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Clean up extra whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * Convert markdown to HTML
   * @param {string} content - Markdown content
   * @returns {string} HTML
   */
  convertToHtml(content) {
    return marked.parse(content, {
      gfm: true,
      breaks: true,
      sanitize: false,
    });
  }

  canTransform(file) {
    const ext = (file.path || '').toLowerCase().match(/\.[^.]+$/);
    return ext && this.supportedExtensions.includes(ext[0]);
  }
}

module.exports = MarkdownTransformer;