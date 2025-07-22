const BaseTransformer = require('../BaseTransformer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

/**
 * SVG description transformer using Gemini API
 * Analyzes SVG code and provides descriptions
 */
class SvgDescriptionTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Generate AI-powered descriptions of SVG files';
    this.supportedExtensions = ['.svg'];
    this.maxSvgSize = options.maxSvgSize || 1 * 1024 * 1024; // 1MB default
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      this.logger.warn('No Gemini API key provided, SVG descriptions will be disabled');
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: options.model || this.config.get('ai.gemini.model')
      });
    }
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    const ext = path.extname(file.path).toLowerCase();
    return ext === '.svg' && this.apiKey;
  }

  /**
   * Transform SVG to description
   */
  async doTransform(file) {
    const size = file.stats?.size || Buffer.byteLength(file.content);
    
    // Check file size
    if (size > this.maxSvgSize) {
      return {
        ...file,
        content: `[SVG too large for analysis: ${this.formatBytes(size)}]`,
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          skippedReason: 'size_limit_exceeded'
        }
      };
    }

    try {
      // Get SVG content as string
      const svgContent = Buffer.isBuffer(file.content) 
        ? file.content.toString('utf8') 
        : file.content;

      // Extract basic SVG info
      const svgInfo = this.extractSvgInfo(svgContent);

      // Generate description using Gemini
      const prompt = this.options.prompt || `Analyze this SVG code and provide a developer-friendly description:

${svgContent.substring(0, 5000)}${svgContent.length > 5000 ? '\n... (truncated)' : ''}

Include in your analysis:
- What the SVG represents or depicts
- Key shapes and elements used
- Dimensions and viewBox details
- Color scheme
- Animation or interaction elements (if any)
- Complexity and optimization suggestions
- Potential use cases

Keep the description concise but technical (2-3 paragraphs).`;

      const result = await this.model.generateContent(prompt);
      const description = result.response.text();

      return {
        ...file,
        content: this.formatDescription(file, description, svgInfo, svgContent),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          ...svgInfo,
          originalSize: size,
          model: this.model.model
        }
      };
    } catch (error) {
      this.logger.error('Failed to generate SVG description', {
        file: file.path,
        error: error.message
      });

      // Return SVG content with error message
      return {
        ...file,
        content: file.content + `\n\n[SVG analysis failed: ${error.message}]`,
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          error: error.message
        }
      };
    }
  }

  /**
   * Extract basic information from SVG
   */
  extractSvgInfo(svgContent) {
    const info = {
      elementCount: 0,
      hasAnimation: false,
      hasScript: false,
      width: null,
      height: null,
      viewBox: null
    };

    try {
      // Count elements (basic)
      info.elementCount = (svgContent.match(/<[^/][^>]*>/g) || []).length;
      
      // Check for animations
      info.hasAnimation = /<animate|<animateTransform|<animateMotion/.test(svgContent);
      
      // Check for scripts
      info.hasScript = /<script/.test(svgContent);
      
      // Extract dimensions
      const widthMatch = svgContent.match(/width="([^"]+)"/);
      const heightMatch = svgContent.match(/height="([^"]+)"/);
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
      
      if (widthMatch) info.width = widthMatch[1];
      if (heightMatch) info.height = heightMatch[1];
      if (viewBoxMatch) info.viewBox = viewBoxMatch[1];
    } catch (error) {
      this.logger.warn('Failed to extract SVG info', { error: error.message });
    }

    return info;
  }

  /**
   * Format the description output
   */
  formatDescription(file, description, svgInfo, originalContent) {
    const filename = path.basename(file.path);
    const dimensions = svgInfo.width && svgInfo.height 
      ? ` (${svgInfo.width} × ${svgInfo.height})` 
      : svgInfo.viewBox 
      ? ` (viewBox: ${svgInfo.viewBox})`
      : '';
    
    let output = `[SVG: ${filename}${dimensions} - ${svgInfo.elementCount} elements]\n\n`;
    output += `${description}\n\n`;
    
    if (svgInfo.hasAnimation) {
      output += `⚠️ Contains animations\n`;
    }
    if (svgInfo.hasScript) {
      output += `⚠️ Contains scripts\n`;
    }
    
    output += `\n--- Original SVG Code ---\n${originalContent}`;
    output += `\n\n[AI-generated analysis by ${this.constructor.name}]`;
    
    return output;
  }
}

module.exports = SvgDescriptionTransformer;