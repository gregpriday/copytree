export default {
  // Global excluded directories (always excluded regardless of location)
  // Only includes version control directories that can't be in .gitignore
  // Everything else (node_modules, .idea, etc.) should be in .gitignore
  globalExcludedDirectories: [
    '.git',      // Git repository metadata
    '.svn',      // Subversion
    '.hg',       // Mercurial
    '.bzr',      // Bazaar
    'CVS',       // CVS
    '_darcs',    // Darcs
  ],

  // Base path excluded directories (only excluded at project root)
  // These are typically in .gitignore, but we exclude them as a safety net
  // Can be overridden by .copytreeinclude if needed
  basePathExcludedDirectories: [],

  // Global excluded files (excluded by name pattern)
  globalExcludedFiles: [
    // Lock files
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'shrinkwrap.yaml',
    'composer.lock', 'Gemfile.lock', 'Pipfile.lock', 'poetry.lock', 'uv.lock', 'pdm.lock', 'requirements.lock',
    'Cargo.lock', 'go.sum', 'mix.lock', 'flake.lock',
    'pubspec.lock', 'Podfile.lock', 'Cartfile.resolved', 'Package.resolved', 'deno.lock',

    // Environment files
    '.env', '.env.local', '.env.*.local', '.env.example',

    // OS files
    '.DS_Store', 'Thumbs.db', 'desktop.ini',
    '$RECYCLE.BIN', 'ehthumbs.db', 'ehthumbs_vista.db',

    // Logs
    '*.log', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',
    'lerna-debug.log*', 'pnpm-debug.log*',

    // Editor files
    '*.swp', '*.swo', '*~', '*.sublime-workspace', '*.sublime-project',

    // Compiled files
    '*.pyc', '*.pyo', '*.pyd', '__pycache__',
    '*.class', '*.jar', '*.war', '*.ear',
    '*.o', '*.obj', '*.exe', '*.dll', '*.so', '*.dylib',
    '*.ncb', '*.sdf', '*.suo', '*.pdb', '*.idb',

    // Archives
    '*.7z', '*.dmg', '*.gz', '*.iso', '*.jar', '*.rar', '*.tar', '*.zip',

    // Media files - always excluded
    '*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.svg', '*.ico',
    '*.mp3', '*.mp4', '*.avi', '*.mov', '*.wmv', '*.flv', '*.webm',
    '*.wav', '*.flac', '*.aac', '*.ogg', '*.wma',
  ],

  // File size limits
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxTotalSize: 100 * 1024 * 1024, // 100MB
  maxFileCount: 10000,

  // Output limits
  maxOutputSize: 50 * 1024 * 1024, // 50MB
  maxCharacterLimit: 2000000, // 2M chars

  // Processing options
  followSymlinks: false,
  includeHidden: false,
  preserveEmptyDirs: false,

  // Binary file handling
  binaryFileAction: 'placeholder', // placeholder, skip, base64, comment (legacy)
  binaryPlaceholderText: '[Binary file not included]',

  // Binary detection configuration
  binaryDetect: {
    sampleBytes: 8192,
    nonPrintableThreshold: 0.3,
  },

  // Binary policy per category (overrides binaryFileAction)
  // Options: comment | skip | placeholder | base64 | convert
  binaryPolicy: {
    image: 'comment', // Images: show comment placeholder
    media: 'comment', // Audio/video: show comment placeholder
    archive: 'comment', // ZIP/TAR/etc: show comment placeholder
    exec: 'comment', // Executables: show comment placeholder
    font: 'comment', // Font files: show comment placeholder
    database: 'comment', // Database files: show comment placeholder
    cert: 'comment', // Certificates: show comment placeholder
    document: 'convert', // PDF/DOC/etc: convert to text if possible
    other: 'comment', // Unknown binaries: show comment placeholder
    text: 'load', // Text files: load normally
  },

  // Template strings for binary file comments
  binaryCommentTemplates: {
    xml: '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
    markdown: '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
  },

  // Line number options
  addLineNumbers: false,
  lineNumberFormat: '%4d: ', // printf-style format

  // Tree view options
  treeIndent: '  ',
  treeConnectors: {
    middle: '├── ',
    last: '└── ',
    vertical: '│   ',
    empty: '    ',
  },

  // Filesystem retry configuration
  fs: {
    retryAttempts: 3, // Maximum number of retry attempts for transient errors
    retryDelay: 100, // Initial delay in milliseconds
    maxDelay: 2000, // Maximum delay cap in milliseconds
  },

  // File discovery configuration
  discovery: {
    // Enable parallel directory traversal (default: false for gradual rollout)
    parallelEnabled: ['1', 'true', 'TRUE', 'True'].includes(
      process.env.COPYTREE_DISCOVERY_PARALLEL
    ),

    // Maximum concurrent directory operations
    // Falls back to app.maxConcurrency if not specified
    maxConcurrency: (() => {
      const val = parseInt(process.env.COPYTREE_DISCOVERY_CONCURRENCY, 10);
      return Number.isInteger(val) && val > 0 ? val : undefined;
    })(),

    // Backpressure threshold (default: 2x concurrency)
    // Pauses scheduling when buffered results exceed this
    highWaterMark: (() => {
      const val = parseInt(process.env.COPYTREE_DISCOVERY_HIGH_WATER_MARK, 10);
      return Number.isInteger(val) && val > 0 ? val : undefined;
    })(),
  },
};