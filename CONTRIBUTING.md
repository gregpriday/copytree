# Contributing to CopyTree

Thank you for your interest in contributing to CopyTree! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

### Prerequisites

- **Node.js 20.0.0 or higher**
- npm (comes with Node.js)
- Git

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/copytree.git
   cd copytree
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run tests to verify setup**
   ```bash
   npm test
   ```

4. **Link the CLI for local development**
   ```bash
   npm link
   ```

Now you can run `copytree` commands and they'll use your local development version.

## Development Workflow

### Branch Strategy

We follow Git Flow:

- `main` - Production-ready code
- `develop` - Main development branch
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `release/*` - Release preparation
- `hotfix/*` - Critical production fixes

### Making Changes

1. **Create a branch from `develop`**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, concise code
   - Follow existing code style (ESM, async/await, etc.)
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**
   ```bash
   npm test                  # Run all tests
   npm run test:coverage     # Check coverage
   npm run lint              # Check code style
   npm run format:check      # Check formatting
   ```

4. **Commit your changes**
   - Use clear, descriptive commit messages
   - Reference issue numbers when applicable
   ```bash
   git commit -m "feat: add new transformer for XYZ files

   - Implement XYZTransformer class
   - Add unit tests
   - Update documentation

   Closes #123"
   ```

5. **Push and create a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style Guidelines

### JavaScript/ESM

- **Use ES Modules** (`import`/`export`, not `require`/`module.exports`)
- **Async/await** - No callbacks, use promises
- **Descriptive names** - Clear variable and function names
- **No unused imports** - Clean up imports

### Naming Conventions

- **Classes**: `PascalCase` (e.g., `PDFTransformer`, `GitUtils`)
- **Files**: `camelCase.js` or `PascalCase.js` matching class name
- **Functions/Variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Events**: `namespace:event` (e.g., `pipeline:start`, `stage:complete`)

### Architecture Patterns

- **Strategy pattern**: Transformers, Formatters
- **Pipeline pattern**: Stage-based processing
- **Observer pattern**: Event emission throughout
- **Singleton pattern**: Config, Logger instances
- **Factory pattern**: Registry creation

## Testing

### Test Structure

```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/              # End-to-end tests
├── performance/      # Performance benchmarks
├── fixtures/         # Test data
└── mocks/            # Mock implementations
```

### Writing Tests

- **Unit tests** for individual classes and functions
- **Integration tests** for pipeline stages and workflows
- **E2E tests** for CLI commands
- **Aim for 80%+ coverage** (enforced by CI)

Example:
```javascript
import MyTransformer from '../src/transforms/transformers/MyTransformer.js';

describe('MyTransformer', () => {
  it('should transform files correctly', async () => {
    const transformer = new MyTransformer();
    const file = { path: 'test.txt', content: 'test' };
    const result = await transformer.transform(file);
    expect(result.transformed).toBe(true);
  });
});
```

## Adding New Features

### Adding a New Transformer

1. Create transformer class in `src/transforms/transformers/`
2. Extend `BaseTransformer`
3. Define transformer traits (inputTypes, outputTypes, heavy, etc.)
4. Implement `transform(file)` method
5. Register in `TransformerRegistry.js`
6. Add configuration options to profile schema
7. Write unit tests
8. Update documentation

### Adding a New Pipeline Stage

1. Create stage class in `src/pipeline/stages/`
2. Extend `Stage` from `src/pipeline/Stage.js`
3. Implement `process(input)` method
4. Add lifecycle hooks if needed
5. Add stage to pipeline in desired order
6. Write unit tests
7. Update documentation

## Documentation

- Update `README.md` for user-facing changes
- Update `CLAUDE.md` for architectural changes
- Add/update docs in `docs/` directory for detailed guides
- Include JSDoc comments for public APIs

## Pull Request Process

1. **Ensure all tests pass** and coverage is maintained
2. **Update documentation** as needed
3. **Follow commit message conventions** (feat, fix, docs, etc.)
4. **Reference related issues** in PR description
5. **Request review** from maintainers
6. **Address feedback** promptly and professionally

### PR Checklist

- [ ] Tests pass locally (`npm test`)
- [ ] Code follows style guidelines (`npm run lint`)
- [ ] New tests added for new functionality
- [ ] Documentation updated
- [ ] Commit messages are clear and descriptive
- [ ] No breaking changes (or clearly documented)
- [ ] CHANGELOG.md updated (if applicable)

## Reporting Issues

### Bug Reports

Include:
- **Description** of the bug
- **Steps to reproduce**
- **Expected behavior**
- **Actual behavior**
- **Environment** (OS, Node version, CopyTree version)
- **Error messages** or logs

### Feature Requests

Include:
- **Clear description** of the feature
- **Use case** - Why is this needed?
- **Proposed implementation** (optional)
- **Alternatives considered** (optional)

## Release Process

(For maintainers)

1. Update version in `package.json` and `config/app.js`
2. Update `CHANGELOG.md`
3. Create release branch
4. Run full test suite
5. Tag release
6. Publish to npm
7. Create GitHub release

## Getting Help

- **Documentation**: https://copytree.dev or `docs/` directory
- **Issues**: https://github.com/gregpriday/copytree/issues
- **Email**: greg@siteorigin.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- GitHub contributors page
- CHANGELOG.md for significant contributions
- README.md for major features

Thank you for contributing to CopyTree!
