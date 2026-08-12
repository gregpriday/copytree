import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      // `latest` rather than a pinned year: the entry point and the doc
      // generator use top-level await, which needs ES2022 or later.
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        node: true,
        es2021: true,
        jest: true,
        console: true,
        process: true,
        Buffer: true,
        __dirname: true,
        __filename: true,
        global: true,
        module: false,
        require: false,
        exports: false,
        import: true,
        export: true,
        setTimeout: true,
        clearTimeout: true,
        setInterval: true,
        clearInterval: true,
        // Web-platform globals Node has provided since well before the
        // supported floor of 22.12, and which cancellation depends on.
        AbortController: true,
        AbortSignal: true,
        DOMException: true,
        TextEncoder: true,
        TextDecoder: true,
        URL: true,
        structuredClone: true,
      },
    },
    rules: {
      // Disable formatting rules as Prettier handles them
      'indent': 'off',
      'quotes': 'off',
      'semi': ['error', 'always'],
      'no-unused-vars': 'off',
      'no-console': 'off',
      'comma-dangle': ['error', 'always-multiline'],
      'arrow-parens': ['error', 'always'],
    },
  },
];