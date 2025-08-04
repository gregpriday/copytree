const path = require('path');
const os = require('os');

module.exports = {
  defaultExclusions: [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'coverage',
    '.cache',
    '.next',
    '.nuxt',
    '.vuepress',
    '.temp',
    '.tmp',
    'vendor',
    'bower_components',
    '*.log',
    '*.lock',
    '.DS_Store',
    'Thumbs.db',
  ],
  
  supportedTransformers: {
    '.pdf': 'pdf',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.bmp': 'image',
    '.md': 'markdown',
    '.mdx': 'markdown',
  },
  
  maxFileSize: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) : 10 * 1024 * 1024, // 10MB default
  
  configDir: path.join(os.homedir(), '.copytree'),
  
  getProfilesDir() {
    return path.join(__dirname, '..', 'profiles');
  },
  
  getUserProfilesDir() {
    return path.join(this.configDir, 'profiles');
  },
  
  getStateDir() {
    return path.join(this.configDir, 'state');
  },
  
  getCacheDir() {
    return path.join(this.configDir, 'cache');
  },
};