export default {
  // 1. JUNK: Files that should never exist in output (complete noise)
  // Global excluded directories (always excluded regardless of location)
  globalExcludedDirectories: [
    // Version control
    '.git', '.svn', '.hg', '.bzr', 'CVS', '_darcs',

    // IDE/Editor directories
    '.idea', '.vscode', '.eclipse', '.settings',

    // Dependencies
    'node_modules', 'bower_components', 'jspm_packages', 'vendor',

    // Build artifacts
    'dist', 'build', 'out', 'target', '.next', '.nuxt', '.output',

    // Test coverage
    'coverage', '.nyc_output',

    // Python cache
    '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',

    // Other caches
    '.sass-cache', '.cache',

    // Infrastructure temp
    '.vagrant', '.serverless',
  ],

  // Base path excluded directories (only excluded at project root)
  // These are typically in .gitignore, but we exclude them as a safety net
  // Can be overridden by .copytreeinclude if needed
  basePathExcludedDirectories: [],

  // Global excluded files (excluded by name pattern)
  globalExcludedFiles: [
    // Ignore/configuration files (CopyTree metadata)
    '.copytreeignore',
    '.gitignore',
    '.copytreeinclude',

    // Environment files with secrets
    '.env', '.env.local', '.env.*.local',

    // OS metadata (pure noise)
    '.DS_Store', 'Thumbs.db', 'desktop.ini', '.directory',
    '$RECYCLE.BIN', 'ehthumbs.db', 'ehthumbs_vista.db',

    // Logs and dumps (high token usage, low AI value)
    '*.log', '*.pid', '*.seed', '*.pid.lock',
    'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',
    'lerna-debug.log*', 'pnpm-debug.log*',

    // Map files (high token usage, AI can't read them)
    '*.map', '*.css.map', '*.js.map',

    // Minified code (AI can't read this effectively)
    '*.min.js', '*.min.css',

    // Editor backup/temp files
    '*~', '*.swp', '*.swo', '*.bak', '*.tmp', '*.orig',
    '*.sublime-workspace', '*.sublime-project',

    // Compiled files (binary noise)
    '*.pyc', '*.pyo', '*.pyd',
    '*.class', '*.jar', '*.war', '*.ear',
    '*.o', '*.obj', '*.exe', '*.dll', '*.so', '*.dylib',
    '*.ncb', '*.sdf', '*.suo', '*.pdb', '*.idb',

    // Archives (binary data)
    '*.7z', '*.dmg', '*.gz', '*.iso', '*.rar', '*.tar', '*.zip',

    // Media files (binary, high token usage)
    '*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.ico',
    '*.mp3', '*.mp4', '*.avi', '*.mov', '*.wmv', '*.flv', '*.webm',
    '*.wav', '*.flac', '*.aac', '*.ogg', '*.wma',
  ],

  // 2. STRUCTURE ONLY: Files to include in tree but exclude content (token optimization)
  // These files provide important structural context but waste tokens if read fully
  structureOnlyPatterns: [
    // Lock files (show dependency state exists, but hash content is useless)
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'shrinkwrap.yaml',
    'composer.lock', 'Gemfile.lock', 'Pipfile.lock', 'poetry.lock', 'uv.lock', 'pdm.lock', 'requirements.lock',
    'Cargo.lock', 'go.sum', 'mix.lock', 'flake.lock',
    'pubspec.lock', 'Podfile.lock', 'Cartfile.resolved', 'Package.resolved', 'deno.lock',

    // SVG (often extremely verbose, low AI value)
    '*.svg',
  ],

  // 3. ESSENTIAL DOTFILES: Force-include these even if includeHidden is false
  // These provide high-value context about how to run/deploy the app
  forceIncludeDotfiles: [
    '.env.example',      // Safe environment template (no secrets)
    '.editorconfig',     // Code style
    '.eslintrc*',        // Linting rules
    '.prettierrc*',      // Formatting rules
    '.babelrc*',         // Transpilation config
    '.dockerignore',     // Docker context
    '.github/**',        // GitHub Actions/workflows (high value)
    '.gitlab-ci.yml',    // GitLab CI
    '.travis.yml',       // Travis CI
    'circle.yml',        // CircleCI
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