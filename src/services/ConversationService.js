const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config/ConfigManager');
const { logger } = require('../utils/logger');

/**
 * Conversation Service - Manages conversation state for the ask command
 */
class ConversationService {
  constructor(options = {}) {
    this.config = config();
    this.logger = logger.child('ConversationService');
    
    // State storage configuration
    this.statePath = path.resolve(
      options.statePath || this.config.get('state.path', '.copytree-state')
    );
    this.maxMessages = options.maxMessages || this.config.get('state.maxMessages', 50);
    this.ttl = options.ttl || this.config.get('state.ttl', 86400); // 24 hours
    
    // Ensure state directory exists
    fs.ensureDirSync(this.statePath);
  }

  /**
   * Create a new conversation
   * @param {Object} options - Initial conversation options
   * @returns {Promise<string>} Conversation ID
   */
  async createConversation(options = {}) {
    const id = this.generateId();
    const conversation = {
      id,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messages: [],
      context: options.context || {},
      metadata: {
        project: options.project || process.cwd(),
        profile: options.profile,
        filesIncluded: options.filesIncluded || 0
      }
    };
    
    await this.saveConversation(conversation);
    this.logger.debug(`Created new conversation: ${id}`);
    
    return id;
  }

  /**
   * Get a conversation by ID
   * @param {string} id - Conversation ID
   * @returns {Promise<Object|null>} Conversation object or null
   */
  async getConversation(id) {
    const filePath = this.getConversationPath(id);
    
    try {
      if (await fs.pathExists(filePath)) {
        const conversation = await fs.readJson(filePath);
        
        // Check if conversation is expired
        if (this.isExpired(conversation)) {
          await this.deleteConversation(id);
          return null;
        }
        
        return conversation;
      }
    } catch (error) {
      this.logger.error(`Failed to read conversation ${id}: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Add a message to a conversation
   * @param {string} id - Conversation ID
   * @param {Object} message - Message object
   * @returns {Promise<Object>} Updated conversation
   */
  async addMessage(id, message) {
    const conversation = await this.getConversation(id);
    
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }
    
    // Add message with timestamp
    conversation.messages.push({
      ...message,
      timestamp: new Date().toISOString()
    });
    
    // Trim messages if exceeding limit
    if (conversation.messages.length > this.maxMessages) {
      conversation.messages = conversation.messages.slice(-this.maxMessages);
    }
    
    // Update timestamp
    conversation.updated = new Date().toISOString();
    
    await this.saveConversation(conversation);
    
    return conversation;
  }

  /**
   * Update conversation context
   * @param {string} id - Conversation ID
   * @param {Object} context - Context to merge
   * @returns {Promise<Object>} Updated conversation
   */
  async updateContext(id, context) {
    const conversation = await this.getConversation(id);
    
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }
    
    // Merge context
    conversation.context = {
      ...conversation.context,
      ...context
    };
    
    // Update timestamp
    conversation.updated = new Date().toISOString();
    
    await this.saveConversation(conversation);
    
    return conversation;
  }

  /**
   * List all active conversations
   * @returns {Promise<Array>} List of conversation summaries
   */
  async listConversations() {
    try {
      const files = await fs.readdir(this.statePath);
      const conversations = [];
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const id = file.replace('.json', '');
        const conversation = await this.getConversation(id);
        
        if (conversation) {
          conversations.push({
            id: conversation.id,
            created: conversation.created,
            updated: conversation.updated,
            messageCount: conversation.messages.length,
            project: conversation.metadata.project
          });
        }
      }
      
      // Sort by updated date, newest first
      conversations.sort((a, b) => 
        new Date(b.updated).getTime() - new Date(a.updated).getTime()
      );
      
      return conversations;
    } catch (error) {
      this.logger.error(`Failed to list conversations: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete a conversation
   * @param {string} id - Conversation ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteConversation(id) {
    const filePath = this.getConversationPath(id);
    
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        this.logger.debug(`Deleted conversation: ${id}`);
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to delete conversation ${id}: ${error.message}`);
    }
    
    return false;
  }

  /**
   * Clean up expired conversations
   * @returns {Promise<number>} Number of conversations deleted
   */
  async cleanupExpired() {
    const conversations = await this.listConversations();
    let deleted = 0;
    
    for (const conv of conversations) {
      const full = await this.getConversation(conv.id);
      if (full && this.isExpired(full)) {
        await this.deleteConversation(conv.id);
        deleted++;
      }
    }
    
    if (deleted > 0) {
      this.logger.info(`Cleaned up ${deleted} expired conversations`);
    }
    
    return deleted;
  }

  /**
   * Format conversation for AI context
   * @param {Object} conversation - Conversation object
   * @param {number} maxMessages - Maximum messages to include
   * @returns {Array} Formatted messages
   */
  formatForAI(conversation, maxMessages = 10) {
    const messages = conversation.messages.slice(-maxMessages);
    
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Save conversation to disk
   * @private
   */
  async saveConversation(conversation) {
    const filePath = this.getConversationPath(conversation.id);
    await fs.writeJson(filePath, conversation, { spaces: 2 });
  }

  /**
   * Get conversation file path
   * @private
   */
  getConversationPath(id) {
    return path.join(this.statePath, `${id}.json`);
  }

  /**
   * Generate unique conversation ID
   * @private
   */
  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Check if conversation is expired
   * @private
   */
  isExpired(conversation) {
    const updated = new Date(conversation.updated);
    const now = new Date();
    const age = (now - updated) / 1000; // age in seconds
    
    return age > this.ttl;
  }
}

// Export singleton instance and class
const conversationService = new ConversationService();

module.exports = {
  ConversationService,
  conversations: conversationService
};