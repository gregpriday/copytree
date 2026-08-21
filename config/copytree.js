/**
 * Read a positive integer from the environment, or `null` for "not set".
 *
 * `null` rather than `undefined`: an `undefined` value does not survive the
 * merge into the effective configuration, so the key vanishes from
 * `config show --sources` entirely and the reader cannot tell whether the
 * setting exists.
 *
 * @param {string} name - Environment variable name
 * @returns {number|null} The value, or null
 */
function positiveIntFromEnv(name) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export default {
  // 1. JUNK: Files that should never exist in output (complete noise)
  // Global excluded directories (always excluded regardless of location)
  globalExcludedDirectories: [
    // Version control
    '.git',
    '.svn',
    '.hg',
    '.bzr',
    'CVS',
    '_darcs',

    // IDE/Editor directories
    '.idea',
    '.vscode',
    '.eclipse',
    '.settings',

    // Dependencies
    'node_modules',
    'bower_components',
    'jspm_packages',
    'vendor',

    // Build artifacts
    'dist',
    'build',
    'out',
    'target',
    '.next',
    '.nuxt',
    '.output',

    // Test coverage
    'coverage',
    '.nyc_output',

    // Python cache
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.ruff_cache',

    // Other caches
    '.sass-cache',
    '.cache',

    // Infrastructure temp
    '.vagrant',
    '.serverless',
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
    '.env',
    '.env.local',
    '.env.*.local',

    // OS metadata (pure noise)
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    '.directory',
    '$RECYCLE.BIN',
    'ehthumbs.db',
    'ehthumbs_vista.db',

    // Logs and dumps (high token usage, low AI value)
    '*.log',
    '*.pid',
    '*.seed',
    '*.pid.lock',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    'lerna-debug.log*',
    'pnpm-debug.log*',

    // Map files (high token usage, AI can't read them)
    '*.map',
    '*.css.map',
    '*.js.map',

    // Minified code (AI can't read this effectively)
    '*.min.js',
    '*.min.css',

    // Editor backup/temp files
    '*~',
    '*.swp',
    '*.swo',
    '*.bak',
    '*.tmp',
    '*.orig',
    '*.sublime-workspace',
    '*.sublime-project',

    // Compiled files (binary noise)
    '*.pyc',
    '*.pyo',
    '*.pyd',
    '*.class',
    '*.jar',
    '*.war',
    '*.ear',
    '*.o',
    '*.obj',
    '*.exe',
    '*.dll',
    '*.so',
    '*.dylib',
    '*.ncb',
    '*.sdf',
    '*.suo',
    '*.pdb',
    '*.idb',

    // Archives (binary data)
    '*.7z',
    '*.dmg',
    '*.gz',
    '*.iso',
    '*.rar',
    '*.tar',
    '*.zip',

    // Media files (binary, high token usage)
    '*.jpg',
    '*.jpeg',
    '*.png',
    '*.gif',
    '*.bmp',
    '*.ico',
    '*.mp3',
    '*.mp4',
    '*.avi',
    '*.mov',
    '*.wmv',
    '*.flv',
    '*.webm',
    '*.wav',
    '*.flac',
    '*.aac',
    '*.ogg',
    '*.wma',
  ],

  // 2. STRUCTURE ONLY: Files to include in tree but exclude content (token optimization)
  // These files provide important structural context but waste tokens if read fully
  structureOnlyPatterns: [
    // Lock files (show dependency state exists, but hash content is useless)
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    'shrinkwrap.yaml',
    'composer.lock',
    'Gemfile.lock',
    'Pipfile.lock',
    'poetry.lock',
    'uv.lock',
    'pdm.lock',
    'requirements.lock',
    'Cargo.lock',
    'go.sum',
    'mix.lock',
    'flake.lock',
    'pubspec.lock',
    'Podfile.lock',
    'Cartfile.resolved',
    'Package.resolved',
    'deno.lock',

    // SVG (often extremely verbose, low AI value)
    '*.svg',
  ],

  // 3. ESSENTIAL DOTFILES: Force-include these even if includeHidden is false
  // These provide high-value context about how to run/deploy the app
  forceIncludeDotfiles: [
    '.env.example', // Safe environment template (no secrets)
    '.editorconfig', // Code style
    '.eslintrc*', // Linting rules
    '.prettierrc*', // Formatting rules
    '.babelrc*', // Transpilation config
    '.dockerignore', // Docker context
    '.github/**', // GitHub Actions/workflows (high value)
    '.gitlab-ci.yml', // GitLab CI
    '.travis.yml', // Travis CI
    'circle.yml', // CircleCI
  ],

  // File size limits
  // maxFileSize is a memory-safety ceiling: nothing above it is ever read.
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxTotalSize: 100 * 1024 * 1024, // 100MB
  maxFileCount: 10000,

  // Hard size gate applied from stat(), independent of file type.
  // Files above this are never opened; they appear in the tree with their size
  // and are reported under stats.excluded.byReason.sizeGate.
  // Only `always` / .copytreeinclude can override the gate.
  // Set to 0 or false to disable.
  sizeGate: 256 * 1024, // 256KB

  // Largest binary a `--binary base64` run will inline. Beyond it the file is
  // reported rather than embedded: base64 costs a third more than the bytes it
  // encodes, and an agent cannot read it anyway.
  maxBase64Size: 1024 * 1024,

  // Processing options
  followSymlinks: false,
  includeHidden: false,

  // Honour `.gitignore`, `.git/info/exclude` and the user's global gitignore.
  // A layer in the one exclusion evaluator, not a separate pass.
  respectGitignore: true,

  // Gitignore fidelity. CopyTree never shells out to `git check-ignore` and never
  // requires a git repository; these are all plain filesystem reads.
  //
  // Precedence, lowest to highest (last match wins, as in git):
  //   1. config globalExcludedDirectories / globalExcludedFiles
  //   2. global gitignore (core.excludesFile)
  //   3. .git/info/exclude
  //   4. root .gitignore
  //   5. nested .gitignore (deepest last)
  //   6. root .copytreeignore
  //   7. nested .copytreeignore (deepest last)
  //   8. caller --exclude patterns
  //   9. .copytreeinclude / always  (highest: overrides everything above)
  gitignore: {
    // Read .gitignore at every directory depth, not just the root.
    nested: true,
    // Read .git/info/exclude as a root-level layer.
    infoExclude: true,
    // Read the user's global gitignore (git config core.excludesFile).
    globalExcludesFile: true,
  },

  // Exclusion accounting (stats.excluded). Aggregate counts are always collected
  // and cost nothing extra; the per-file detail list requires `explain: true`.
  exclusionReport: {
    // How many of the largest exclusions to retain under `explain: true`.
    topN: 50,

    // Ceiling on retained decisions under `all` retention (`plan --explain`,
    // `explain`). Beyond it the report sets `truncated` and counts what it
    // dropped, rather than quietly reading as "that is everything".
    maxEntries: 100000,
  },

  // Binary file handling
  binaryFileAction: 'placeholder', // placeholder, skip, base64, comment (legacy)
  binaryPlaceholderText: '[Binary file not included]',

  // Binary detection configuration
  binaryDetect: {
    sampleBytes: 8192,
    nonPrintableThreshold: 0.3,
  },

  // Binary/media classification by extension, grouped by category.
  //
  // Extension comes first: if a file's extension appears in any group below, it is
  // classified straight from the path with no open() and no read(). Content sniffing
  // (magic numbers, null bytes, non-printable ratio) only runs for extensions that
  // are NOT listed here. A 3 GB .mp4 costs one stat, same as a 40 KB .ts.
  //
  // Groups are replaced wholesale by user config, so a project can override one
  // category without restating the rest. `--include-binary` overrides everything.
  //
  // !!! NEVER add these to any group below. The failure mode is silent and severe:
  // source code would be dropped from every context generated against the project.
  //   .ts   TypeScript, not MPEG transport stream
  //   .m    Objective-C
  //   .h .hh .hpp   C/C++ headers
  //   .r .R  R
  //   .d    D (and .d.ts)
  //   .pl .pm   Perl
  //   .cs .rs .go .swift .kt .scala .lua .sql
  //   .sh .bash .zsh .fish .ps1 .bat .cmd
  //   .vue .svelte .astro
  //   .html .htm   markup, and source code in most repos
  //   .svg  handled by structureOnlyPatterns, not here
  //   .md .mdx .yml .yaml .toml .ini .env.example
  //
  // Text formats that are usually small and occasionally enormous (.json, .jsonl,
  // .csv, .tsv, .xml, .sql, .log, .txt, .snap, .po, generated sources) are
  // deliberately absent: an extension rule is wrong in both directions for those.
  // They are bounded by `sizeGate` instead.
  binaryExtensions: {
    video: [
      '.mp4',
      '.m4v',
      '.mov',
      '.avi',
      '.mkv',
      '.webm',
      '.wmv',
      '.flv',
      '.f4v',
      '.mpg',
      '.mpeg',
      '.m2v',
      '.mts',
      '.m2ts',
      '.3gp',
      '.3g2',
      '.ogv',
      '.vob',
      '.rm',
      '.rmvb',
      '.divx',
      '.asf',
      '.mxf',
      '.r3d',
      '.braw',
    ],
    audio: [
      '.mp3',
      '.wav',
      '.flac',
      '.aac',
      '.ogg',
      '.oga',
      '.opus',
      '.m4a',
      '.m4b',
      '.m4p',
      '.wma',
      '.aiff',
      '.aif',
      '.aifc',
      '.alac',
      '.amr',
      '.ape',
      '.dsf',
      '.dff',
      '.mid',
      '.midi',
      '.caf',
      '.au',
      '.voc',
    ],
    image: [
      '.png',
      '.jpg',
      '.jpeg',
      '.jpe',
      '.gif',
      '.bmp',
      '.dib',
      '.tif',
      '.tiff',
      '.webp',
      '.avif',
      '.heic',
      '.heif',
      '.jxl',
      '.ico',
      '.icns',
      '.cur',
      '.tga',
      '.exr',
      '.hdr',
      '.pbm',
      '.pgm',
      '.ppm',
      '.raw',
      '.cr2',
      '.cr3',
      '.nef',
      '.arw',
      '.orf',
      '.rw2',
      '.raf',
      '.dng',
      '.sr2',
      '.pef',
    ],
    design: [
      '.psd',
      '.psb',
      '.ai',
      '.indd',
      '.indt',
      '.xcf',
      '.sketch',
      '.fig',
      '.afdesign',
      '.afphoto',
      '.afpub',
      '.cdr',
      '.clip',
      '.procreate',
      '.swf',
      '.fla',
    ],
    model3d: [
      '.blend',
      '.c4d',
      '.ma',
      '.mb',
      '.max',
      '.fbx',
      '.glb',
      '.gltf',
      '.usd',
      '.usda',
      '.usdc',
      '.usdz',
      '.stl',
      '.3ds',
      '.dae',
      '.abc',
      '.ply',
      '.prproj',
      '.aep',
      '.aet',
      '.fcpxml',
      '.drp',
      '.veg',
      '.als',
      '.flp',
      '.logicx',
      '.band',
    ],
    font: [
      '.ttf',
      '.otf',
      '.woff',
      '.woff2',
      '.eot',
      '.ttc',
      '.otc',
      '.pfb',
      '.pfm',
      '.fon',
      '.dfont',
    ],
    archive: [
      '.zip',
      '.zipx',
      '.tar',
      '.gz',
      '.tgz',
      '.bz2',
      '.tbz',
      '.tbz2',
      '.xz',
      '.txz',
      '.zst',
      '.zstd',
      '.7z',
      '.rar',
      '.lz',
      '.lz4',
      '.lzma',
      '.lzo',
      '.br',
      '.cab',
      '.arj',
      '.ace',
      '.z',
      '.cpio',
      '.pax',
    ],
    diskImage: [
      '.dmg',
      '.iso',
      '.img',
      '.vhd',
      '.vhdx',
      '.vmdk',
      '.vdi',
      '.qcow2',
      '.sparseimage',
      '.sparsebundle',
      '.toast',
    ],
    package: [
      '.pkg',
      '.mpkg',
      '.deb',
      '.rpm',
      '.apk',
      '.aab',
      '.ipa',
      '.msi',
      '.msix',
      '.msixbundle',
      '.appx',
      '.appxbundle',
      '.snap',
      '.flatpak',
      '.appimage',
      '.crx',
      '.xpi',
      '.vsix',
      '.nupkg',
      '.whl',
      '.egg',
      '.gem',
      '.jar',
      '.war',
      '.ear',
      '.aar',
      '.xcarchive',
    ],
    executable: [
      '.exe',
      '.com',
      '.scr',
      '.dll',
      '.so',
      '.dylib',
      '.bundle',
      '.a',
      '.lib',
      '.o',
      '.obj',
      '.node',
      '.wasm',
      '.class',
      '.pyc',
      '.pyo',
      '.pyd',
      '.elf',
      '.ko',
      '.rlib',
      '.rmeta',
      '.beam',
      '.nexe',
    ],
    debug: [
      '.pdb',
      '.dSYM',
      '.idb',
      '.ilk',
      '.exp',
      '.heapsnapshot',
      '.heapprofile',
      '.cpuprofile',
      '.trace',
      '.etl',
      '.nettrace',
      '.dtps',
      '.dump',
      '.core',
      '.mdmp',
      '.minidump',
    ],
    database: [
      '.sqlite',
      '.sqlite3',
      '.sqlitedb',
      '.db',
      '.db3',
      '.mdb',
      '.accdb',
      '.dbf',
      '.realm',
      '.ldb',
      '.sst',
      '.mdf',
      '.ldf',
      '.ibd',
      '.frm',
      '.myd',
      '.myi',
      '.rdb',
      '.aof',
      '.pack',
      '.idx',
    ],
    mlWeights: [
      '.pt',
      '.pth',
      '.ckpt',
      '.safetensors',
      '.gguf',
      '.ggml',
      '.onnx',
      '.pb',
      '.tflite',
      '.mlmodel',
      '.mlpackage',
      '.h5',
      '.hdf5',
      '.caffemodel',
      '.params',
      '.npz',
      '.npy',
      '.joblib',
      '.pkl',
      '.pickle',
    ],
    dataBlob: [
      '.parquet',
      '.orc',
      '.avro',
      '.arrow',
      '.feather',
      '.msgpack',
      '.bson',
      '.protobuf',
      '.mat',
      '.sav',
      '.rds',
      '.rdata',
      '.dta',
      '.por',
      '.sas7bdat',
      '.fst',
    ],
    // Convertible documents. `.html`/`.htm` are deliberately NOT here: HTML is
    // source code in most repos we touch and must be read as text.
    document: [
      '.pdf',
      '.doc',
      '.docx',
      '.dot',
      '.dotx',
      '.xls',
      '.xlsx',
      '.xlsm',
      '.xlsb',
      '.ppt',
      '.pptx',
      '.pps',
      '.odt',
      '.ods',
      '.odp',
      '.odg',
      '.rtf',
      '.pages',
      '.numbers',
      '.key',
      '.epub',
      '.mobi',
      '.azw',
      '.azw3',
      '.fb2',
      '.djvu',
      '.chm',
      '.one',
      '.onepkg',
      '.vsd',
      '.vsdx',
    ],
    // Excluded for two reasons at once: binary, and key material.
    // NOTE: `.key` also appears under `document` (Apple Keynote). Some projects
    // use `.key` for non-secret text; those should override the `cert` group.
    cert: [
      '.pem',
      '.der',
      '.crt',
      '.cer',
      '.p7b',
      '.p7c',
      '.p12',
      '.pfx',
      '.jks',
      '.keystore',
      '.kdbx',
      '.gpg',
      '.asc',
      '.kbx',
      '.ppk',
    ],
    other: ['.dat', '.bin', '.blob', '.cache', '.DS_Store', '.sublime-workspace'],
  },

  // Binary policy per category (overrides binaryFileAction)
  // Options: skip | comment | placeholder | base64
  binaryPolicy: {
    image: 'comment', // Images: show comment placeholder
    video: 'comment', // Video: show comment placeholder
    audio: 'comment', // Audio: show comment placeholder
    media: 'comment', // Legacy alias for audio/video
    design: 'comment', // Design source files: show comment placeholder
    model3d: 'comment', // 3D/NLE project files: show comment placeholder
    archive: 'comment', // ZIP/TAR/etc: show comment placeholder
    diskImage: 'comment', // Disk images: show comment placeholder
    package: 'comment', // Installers/bundles: show comment placeholder
    executable: 'comment', // Executables and objects: show comment placeholder
    exec: 'comment', // Legacy alias for executable
    debug: 'comment', // Debug/profiling artifacts: show comment placeholder
    font: 'comment', // Font files: show comment placeholder
    database: 'comment', // Database files: show comment placeholder
    mlWeights: 'comment', // Model weights: show comment placeholder
    dataBlob: 'comment', // Columnar/serialized data: show comment placeholder
    cert: 'comment', // Certificates and key material: show comment placeholder
    // PDF/DOC/etc. Treated like any other binary: named in the tree, with a
    // placeholder body. This was `convert`, which loaded the raw bytes for a
    // converter that does not exist — and the secrets guard then dropped the
    // file outright as unscannable, so documents silently vanished from the
    // export instead of appearing as placeholders.
    document: 'placeholder',
    other: 'comment', // Unknown binaries: show comment placeholder
    // `text: 'load'` used to sit here. This map is consulted only for files
    // that were classified as binary, so the text category never reached it:
    // the entry documented a policy that no code path could apply, and `load`
    // was in the schema's enum for its sake alone. Text files are read because
    // they are text, not because of a policy key.
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

  // File discovery configuration.
  //
  // The three environment variables read here are the whole of CopyTree's
  // environment interface, and they are operational rather than semantic: they
  // tune how hard the walker works, never which files it selects or what the
  // output contains. That line is deliberate — a colleague reproducing your
  // export should not need your shell to do it. `copytree doctor --format json`
  // reports their effective values.
  discovery: {
    // Parallel directory traversal. Off by default; COPYTREE_DISCOVERY_PARALLEL.
    parallelEnabled: ['1', 'true', 'TRUE', 'True'].includes(
      process.env.COPYTREE_DISCOVERY_PARALLEL,
    ),

    // Concurrent directory operations. COPYTREE_DISCOVERY_CONCURRENCY.
    //
    // `null` means "follow app.maxConcurrency", which is the actual default and
    // is why this is not simply the number 5. It used to be `undefined`, which
    // reads identically in JavaScript and does not survive into the merged
    // configuration at all — so `config show --sources` had no row for it and a
    // reader could not discover the setting existed.
    maxConcurrency: positiveIntFromEnv('COPYTREE_DISCOVERY_CONCURRENCY'),

    // Backpressure threshold; scheduling pauses above it.
    // `null` means "twice the effective concurrency".
    // COPYTREE_DISCOVERY_HIGH_WATER_MARK.
    highWaterMark: positiveIntFromEnv('COPYTREE_DISCOVERY_HIGH_WATER_MARK'),
  },
};
