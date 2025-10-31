import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2021,
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
  {
    files: ['**/*.jsx'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
];