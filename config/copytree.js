const { env } = require('../src/config/ConfigManager');

module.exports = {
  // Global excluded directories (always excluded regardless of location)
  globalExcludedDirectories: [
    // Version control
    '.git', '.svn', '.hg', '.bzr', 'CVS', '_darcs',
    
    // IDEs and editors
    '.idea', '.vscode', '.vs', '.settings', 'nbproject', '.project',
    '.buildpath', '.Rproj.user', '.spyderproject', '.spyproject',
    '.ropeproject', '.venv', '.mypy_cache', '.dmypy.json',
    
    // Dependencies
    'node_modules', 'bower_components', 'jspm_packages',
    'venv', 'env', 'ENV', 'virtualenv', '.virtualenv',
    'pipenv', '.pipenv', 'poetry', '.poetry',
    'conda-meta', '.conda',
    
    // Build and cache
    '__pycache__', '.pytest_cache', '.tox', '.nox',
    '.coverage', 'htmlcov', '.nyc_output', 'coverage',
    '.sass-cache', '.cache', '.parcel-cache', '.next',
    '.nuxt', '.vuepress', '.docusaurus', '.serverless',
    '.fusebox', '.dynamodb', '.temp', '.tmp', 'tmp', 'temp',
    
    // Mobile
    '.gradle', '.idea/gradle.xml', '.idea/libraries',
    'Pods', 'DerivedData', 'xcuserdata',
    
    // Other
    '.vagrant', '.terraform', '.pulumi',
    '.ipynb_checkpoints', '.jupyter',
    'thumbs.db', '.DS_Store', 'desktop.ini',
  ],
  
  // Base path excluded directories (only excluded at project root)
  basePathExcludedDirectories: [
    'vendor',      // PHP Composer
    'Pods',        // iOS CocoaPods  
    '.github',     // GitHub config
    '.gitlab',     // GitLab config
    '.circleci',   // CircleCI config
    '.travis',     // Travis CI
    'dist',        // Distribution/build output
    'build',       // Build output
    'out',         // Output directory
    'target',      // Maven/Gradle output
    '.webpack',    // Webpack
  ],
  
  // Global excluded files (excluded by name pattern)
  globalExcludedFiles: [
    // Lock files
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'composer.lock', 'Gemfile.lock', 'Pipfile.lock',
    'poetry.lock', 'Cargo.lock', 'pubspec.lock',
    
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
    
    // Media files (configurable)
    ...(env('COPYTREE_EXCLUDE_MEDIA', true) ? [
      '*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.svg', '*.ico',
      '*.mp3', '*.mp4', '*.avi', '*.mov', '*.wmv', '*.flv', '*.webm',
      '*.wav', '*.flac', '*.aac', '*.ogg', '*.wma',
    ] : []),
  ],
  
  // File size limits
  maxFileSize: env('COPYTREE_MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB
  maxTotalSize: env('COPYTREE_MAX_TOTAL_SIZE', 100 * 1024 * 1024), // 100MB
  maxFileCount: env('COPYTREE_MAX_FILE_COUNT', 10000),
  
  // Output limits
  maxOutputSize: env('COPYTREE_MAX_OUTPUT_SIZE', 50 * 1024 * 1024), // 50MB
  maxCharacterLimit: env('COPYTREE_MAX_CHARS', 2000000), // 2M chars
  
  // Processing options
  followSymlinks: env('COPYTREE_FOLLOW_SYMLINKS', false),
  includeHidden: env('COPYTREE_INCLUDE_HIDDEN', false),
  preserveEmptyDirs: env('COPYTREE_PRESERVE_EMPTY_DIRS', false),
  
  // Binary file handling
  binaryFileAction: env('COPYTREE_BINARY_ACTION', 'placeholder'), // placeholder, skip, base64
  binaryPlaceholderText: '[Binary file not included]',
  
  // Line number options
  addLineNumbers: env('COPYTREE_LINE_NUMBERS', false),
  lineNumberFormat: env('COPYTREE_LINE_NUMBER_FORMAT', '%4d: '), // printf-style format
  
  // Tree view options
  treeIndent: env('COPYTREE_TREE_INDENT', '  '),
  treeConnectors: {
    middle: '├── ',
    last: '└── ',
    vertical: '│   ',
    empty: '    ',
  },
};