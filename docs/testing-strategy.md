# Testing Strategy for CopyTree Node.js

## Overview

This document outlines a comprehensive testing strategy for the Node.js port of CopyTree, covering unit tests, integration tests, end-to-end tests, and performance benchmarks. The goal is to ensure reliability, maintainability, and feature parity with the PHP version.

## Testing Framework Stack

### Core Testing Tools
```json
{
  "devDependencies": {
    "jest": "^30.0.4",
    "@jest/globals": "^30.0.4",
    "supertest": "^7.0.0",
    "mock-fs": "^5.4.0",
    "nock": "^14.0.0",
    "sinon": "^19.0.0",
    "@sinonjs/fake-timers": "^13.0.0",
    "jest-extended": "^4.0.0",
    "jest-mock-extended": "^4.0.0"
  }
}
```

### Additional Testing Utilities
- **eslint**: Code quality
- **prettier**: Code formatting
- **husky**: Pre-commit hooks
- **lint-staged**: Run tests on staged files
- **nyc**: Code coverage reporting
- **benchmark**: Performance testing

## Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── commands/           # Command logic tests
│   ├── transforms/         # Transformer tests
│   ├── pipeline/           # Pipeline stage tests
│   ├── services/           # Service layer tests
│   ├── utils/             # Utility function tests
│   └── ai/                # AI provider tests
├── integration/            # Integration tests
│   ├── cli/               # CLI integration tests
│   ├── profiles/          # Profile system tests
│   ├── git/               # Git integration tests
│   └── ai/                # AI integration tests
├── e2e/                    # End-to-end tests
│   ├── scenarios/         # Real-world scenarios
│   └── fixtures/          # Test projects
├── performance/            # Performance benchmarks
│   ├── benchmarks/        # Benchmark suites
│   └── reports/           # Performance reports
├── fixtures/               # Shared test fixtures
│   ├── files/             # Test files
│   ├── projects/          # Test projects
│   └── mocks/             # Mock data
└── helpers/                # Test utilities
    ├── setup.js           # Jest setup
    ├── matchers.js        # Custom matchers
    └── factories.js       # Test data factories
```

## Jest Configuration

```javascript
// jest.config.js
module.exports = {
    testEnvironment: 'node',
    
    // Test locations
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    
    // Test patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js'
    ],
    
    // Coverage settings
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/index.js'
    ],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    
    // Setup files
    setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.js'],
    
    // Module mappings
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@test/(.*)$': '<rootDir>/tests/$1'
    },
    
    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/coverage/'
    ],
    
    // Timeouts
    testTimeout: 30000,
    
    // Reporters
    reporters: [
        'default',
        ['jest-html-reporter', {
            pageTitle: 'CopyTree Test Report',
            outputPath: 'coverage/test-report.html'
        }]
    ]
};
```

## Unit Testing

### 1. Command Tests

```javascript
// tests/unit/commands/copy.test.js
const { copyCommand } = require('@/commands/copy');
const { ProfileLoader } = require('@/profiles/ProfileLoader');
const { Pipeline } = require('@/pipeline/Pipeline');

jest.mock('@/profiles/ProfileLoader');
jest.mock('@/pipeline/Pipeline');

describe('copyCommand', () => {
    let mockProfileLoader;
    let mockPipeline;
    
    beforeEach(() => {
        mockProfileLoader = {
            load: jest.fn().mockResolvedValue({
                name: 'default',
                include: ['**/*.js'],
                exclude: ['node_modules']
            })
        };
        ProfileLoader.mockImplementation(() => mockProfileLoader);
        
        mockPipeline = {
            through: jest.fn().mockReturnThis(),
            process: jest.fn().mockResolvedValue([])
        };
        Pipeline.mockImplementation(() => mockPipeline);
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    it('should load default profile when not specified', async () => {
        await copyCommand('.', {});
        
        expect(mockProfileLoader.load).toHaveBeenCalledWith('default', {});
    });
    
    it('should apply AI filter when specified', async () => {
        await copyCommand('.', { aiFilter: 'authentication files' });
        
        const stages = mockPipeline.through.mock.calls[0][0];
        const aiFilterStage = stages.find(s => s.name === 'AIFilterStage');
        expect(aiFilterStage).toBeDefined();
    });
    
    it('should handle Git modified files', async () => {
        await copyCommand('.', { modified: true });
        
        const stages = mockPipeline.through.mock.calls[0][0];
        const gitStage = stages.find(s => s.name === 'GitFilterStage');
        expect(gitStage).toBeDefined();
        expect(gitStage.options.modified).toBe(true);
    });
});
```

### 2. Transformer Tests

```javascript
// tests/unit/transforms/PDFTransformer.test.js
const PDFTransformer = require('@/transforms/transformers/PDFTransformer');
const fs = require('fs-extra');
const path = require('path');

describe('PDFTransformer', () => {
    let transformer;
    const fixturesPath = path.join(__dirname, '../../fixtures/files');
    
    beforeEach(() => {
        transformer = new PDFTransformer();
    });
    
    it('should extract text from PDF', async () => {
        const file = {
            path: path.join(fixturesPath, 'sample.pdf'),
            name: 'sample.pdf'
        };
        
        const result = await transformer.transform(file);
        
        expect(result.content).toContain('Sample PDF content');
        expect(result.metadata.method).toBeDefined();
    });
    
    it('should handle corrupted PDFs gracefully', async () => {
        const file = {
            path: path.join(fixturesPath, 'corrupted.pdf'),
            name: 'corrupted.pdf'
        };
        
        const result = await transformer.transform(file);
        
        expect(result.content).toBeDefined();
        expect(result.metadata.error).toBeDefined();
    });
    
    it('should use pdftotext when available', async () => {
        const mockExec = jest.fn().mockResolvedValue({
            stdout: 'Extracted text'
        });
        
        jest.doMock('child_process', () => ({
            exec: mockExec
        }));
        
        const file = { path: 'test.pdf' };
        const result = await transformer.transform(file);
        
        expect(mockExec).toHaveBeenCalledWith(
            expect.stringContaining('pdftotext')
        );
        expect(result.metadata.method).toBe('pdftotext');
    });
});
```

### 3. Pipeline Tests

```javascript
// tests/unit/pipeline/Pipeline.test.js
const { Pipeline } = require('@/pipeline/Pipeline');

describe('Pipeline', () => {
    it('should process stages in order', async () => {
        const pipeline = new Pipeline();
        const results = [];
        
        class Stage1 {
            async process(input) {
                results.push('stage1');
                return [...input, 'stage1'];
            }
        }
        
        class Stage2 {
            async process(input) {
                results.push('stage2');
                return [...input, 'stage2'];
            }
        }
        
        const output = await pipeline
            .through([Stage1, Stage2])
            .process([]);
        
        expect(results).toEqual(['stage1', 'stage2']);
        expect(output).toEqual(['stage1', 'stage2']);
    });
    
    it('should emit progress events', async () => {
        const pipeline = new Pipeline();
        const events = [];
        
        pipeline.on('stage:complete', (event) => {
            events.push(event);
        });
        
        class TestStage {
            async process(input) {
                return input;
            }
        }
        
        await pipeline.through([TestStage]).process([]);
        
        expect(events).toHaveLength(1);
        expect(events[0].stage).toBe('TestStage');
    });
});
```

### 4. AI Provider Tests

```javascript
// tests/unit/ai/providers/GeminiProvider.test.js
const GeminiProvider = require('@/ai/providers/GeminiProvider');
const { GoogleGenerativeAI } = require('@google/generative-ai');

jest.mock('@google/generative-ai');

describe('GeminiProvider', () => {
    let provider;
    let mockModel;
    let mockChat;
    
    beforeEach(() => {
        mockChat = {
            sendMessage: jest.fn().mockResolvedValue({
                response: {
                    text: () => 'Test response',
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 20,
                        totalTokenCount: 30
                    }
                }
            })
        };
        
        mockModel = {
            startChat: jest.fn().mockReturnValue(mockChat)
        };
        
        GoogleGenerativeAI.mockImplementation(() => ({
            getGenerativeModel: jest.fn().mockReturnValue(mockModel)
        }));
        
        provider = new GeminiProvider({ apiKey: 'test-key' });
    });
    
    it('should generate completion', async () => {
        const messages = [
            { role: 'user', content: 'Hello' }
        ];
        
        const response = await provider.generateCompletion(messages);
        
        expect(response.text).toBe('Test response');
        expect(response.usage.totalTokens).toBe(30);
    });
    
    it('should handle conversation history', async () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
            { role: 'user', content: 'How are you?' }
        ];
        
        await provider.generateCompletion(messages);
        
        expect(mockModel.startChat).toHaveBeenCalledWith({
            history: expect.arrayContaining([
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ text: 'Hi there' }] }
            ])
        });
    });
});
```

## Integration Testing

### 1. CLI Integration Tests

```javascript
// tests/integration/cli/copy.test.js
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs-extra');

describe('CLI: copy command', () => {
    const testProjectPath = path.join(__dirname, '../../fixtures/projects/sample');
    const cliPath = path.join(__dirname, '../../../bin/copytree.js');
    
    it('should copy project to clipboard', async () => {
        const { stdout, stderr } = await execAsync(
            `node ${cliPath} copy ${testProjectPath}`
        );
        
        expect(stderr).toBe('');
        expect(stdout).toContain('Copied to clipboard');
    });
    
    it('should respect profile filters', async () => {
        const { stdout } = await execAsync(
            `node ${cliPath} copy ${testProjectPath} --profile=javascript --display`
        );
        
        expect(stdout).toContain('.js');
        expect(stdout).not.toContain('.md');
    });
    
    it('should handle AI filtering', async () => {
        // Mock AI response
        process.env.GEMINI_API_KEY = 'test-key';
        
        const { stdout } = await execAsync(
            `node ${cliPath} copy ${testProjectPath} --ai-filter="test files" --dry-run`
        );
        
        expect(stdout).toContain('Files matching "test files"');
    });
});
```

### 2. Profile System Tests

```javascript
// tests/integration/profiles/ProfileLoader.test.js
const { ProfileLoader } = require('@/profiles/ProfileLoader');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('ProfileLoader Integration', () => {
    let loader;
    const tempDir = path.join(os.tmpdir(), 'copytree-test');
    
    beforeEach(async () => {
        await fs.ensureDir(tempDir);
        loader = new ProfileLoader();
    });
    
    afterEach(async () => {
        await fs.remove(tempDir);
    });
    
    it('should load built-in profiles', async () => {
        const profile = await loader.load('default');
        
        expect(profile.name).toBe('default');
        expect(profile.exclude).toContain('node_modules');
    });
    
    it('should load custom profiles from .ctree', async () => {
        const customProfile = {
            name: 'custom',
            include: ['src/**/*'],
            exclude: ['test/**/*']
        };
        
        await fs.ensureDir(path.join(tempDir, '.ctree'));
        await fs.writeJson(
            path.join(tempDir, '.ctree', 'custom.json'),
            customProfile
        );
        
        const profile = await loader.load('custom', {}, tempDir);
        
        expect(profile.name).toBe('custom');
        expect(profile.include).toContain('src/**/*');
    });
    
    it('should merge command options with profile', async () => {
        const profile = await loader.load('default', {
            filter: ['*.js'],
            exclude: ['dist']
        });
        
        expect(profile.include).toContain('*.js');
        expect(profile.exclude).toContain('dist');
    });
});
```

## End-to-End Testing

### 1. Real-World Scenarios

```javascript
// tests/e2e/scenarios/laravel-project.test.js
const { runCopytree } = require('@test/helpers/cli');
const path = require('path');

describe('E2E: Laravel Project', () => {
    const projectPath = path.join(__dirname, '../../fixtures/projects/laravel');
    
    it('should correctly process Laravel project', async () => {
        const result = await runCopytree([
            'copy',
            projectPath,
            '--profile=laravel',
            '--display'
        ]);
        
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('app/');
        expect(result.stdout).toContain('routes/');
        expect(result.stdout).not.toContain('vendor/');
        expect(result.stdout).not.toContain('node_modules/');
    });
    
    it('should handle git integration', async () => {
        const result = await runCopytree([
            'copy',
            projectPath,
            '--modified',
            '--with-git-status',
            '--display'
        ]);
        
        expect(result.exitCode).toBe(0);
        // Should only include modified files
        expect(result.stdout).toMatch(/\[M\]/);
    });
});
```

### 2. Performance Scenarios

```javascript
// tests/e2e/scenarios/large-project.test.js
describe('E2E: Large Project Performance', () => {
    const largeProjectPath = path.join(__dirname, '../../fixtures/projects/large');
    
    it('should handle projects with 10k+ files', async () => {
        const startTime = Date.now();
        
        const result = await runCopytree([
            'copy',
            largeProjectPath,
            '--dry-run'
        ]);
        
        const duration = Date.now() - startTime;
        
        expect(result.exitCode).toBe(0);
        expect(duration).toBeLessThan(30000); // 30 seconds
    });
    
    it('should respect memory limits', async () => {
        const memBefore = process.memoryUsage().heapUsed;
        
        await runCopytree([
            'copy',
            largeProjectPath,
            '--char-limit=10000000' // 10MB
        ]);
        
        const memAfter = process.memoryUsage().heapUsed;
        const memDelta = memAfter - memBefore;
        
        expect(memDelta).toBeLessThan(500 * 1024 * 1024); // 500MB
    });
});
```

## Performance Testing

### 1. Benchmark Suite

```javascript
// tests/performance/benchmarks/file-processing.bench.js
const Benchmark = require('benchmark');
const { FileLoader } = require('@/transforms/transformers/FileLoader');
const { PDFTransformer } = require('@/transforms/transformers/PDFTransformer');

const suite = new Benchmark.Suite();

suite
    .add('FileLoader#transform - small file', {
        defer: true,
        fn: async function(deferred) {
            const loader = new FileLoader();
            await loader.transform({
                path: 'fixtures/files/small.txt'
            });
            deferred.resolve();
        }
    })
    .add('FileLoader#transform - large file', {
        defer: true,
        fn: async function(deferred) {
            const loader = new FileLoader();
            await loader.transform({
                path: 'fixtures/files/large.txt'
            });
            deferred.resolve();
        }
    })
    .add('PDFTransformer#transform', {
        defer: true,
        fn: async function(deferred) {
            const transformer = new PDFTransformer();
            await transformer.transform({
                path: 'fixtures/files/sample.pdf'
            });
            deferred.resolve();
        }
    })
    .on('cycle', function(event) {
        console.log(String(event.target));
    })
    .on('complete', function() {
        console.log('Fastest is ' + this.filter('fastest').map('name'));
    })
    .run({ async: true });
```

### 2. Memory Profiling

```javascript
// tests/performance/memory-profile.js
const memwatch = require('memwatch-next');
const { copyCommand } = require('@/commands/copy');

async function profileMemory() {
    const hd = new memwatch.HeapDiff();
    
    // Run command
    await copyCommand('./large-project', {
        profile: 'default',
        output: '/tmp/output.xml'
    });
    
    const diff = hd.end();
    
    console.log('Memory diff:', diff);
    
    // Check for leaks
    memwatch.on('leak', (info) => {
        console.error('Memory leak detected:', info);
    });
}

profileMemory();
```

## Test Helpers and Utilities

### 1. Custom Jest Matchers

```javascript
// tests/helpers/matchers.js
expect.extend({
    toBeValidXML(received) {
        const { XMLParser } = require('fast-xml-parser');
        const parser = new XMLParser();
        
        try {
            parser.parse(received);
            return {
                message: () => `expected ${received} not to be valid XML`,
                pass: true
            };
        } catch (error) {
            return {
                message: () => `expected ${received} to be valid XML: ${error.message}`,
                pass: false
            };
        }
    },
    
    toContainFile(received, filePath) {
        const contains = received.includes(`<file name="${filePath}"`);
        
        return {
            message: () => `expected output to ${contains ? 'not ' : ''}contain file ${filePath}`,
            pass: contains
        };
    }
});
```

### 2. Test Factories

```javascript
// tests/helpers/factories.js
class TestFileFactory {
    static createFile(overrides = {}) {
        return {
            path: '/test/file.js',
            name: 'file.js',
            size: 1024,
            mtime: new Date(),
            content: 'console.log("test");',
            ...overrides
        };
    }
    
    static createProject(name, files = []) {
        return {
            name,
            path: `/projects/${name}`,
            files: files.length ? files : [
                this.createFile({ path: `${name}/index.js` }),
                this.createFile({ path: `${name}/README.md` })
            ]
        };
    }
    
    static createProfile(overrides = {}) {
        return {
            name: 'test-profile',
            include: ['**/*'],
            exclude: ['node_modules'],
            transforms: {},
            ...overrides
        };
    }
}

module.exports = { TestFileFactory };
```

### 3. Mock File System

```javascript
// tests/helpers/mockFs.js
const mockFs = require('mock-fs');

function createMockFileSystem(structure = {}) {
    const defaultStructure = {
        '/project': {
            'src': {
                'index.js': 'console.log("Hello");',
                'utils.js': 'module.exports = {};'
            },
            'tests': {
                'index.test.js': 'test("works", () => {});'
            },
            'package.json': JSON.stringify({
                name: 'test-project',
                version: '1.0.0'
            }),
            '.gitignore': 'node_modules\ndist'
        }
    };
    
    mockFs({
        ...defaultStructure,
        ...structure
    });
}

function restoreFileSystem() {
    mockFs.restore();
}

module.exports = {
    createMockFileSystem,
    restoreFileSystem
};
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
        
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node }}
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run linter
      run: npm run lint
      
    - name: Run unit tests
      run: npm run test:unit
      
    - name: Run integration tests
      run: npm run test:integration
      env:
        GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        
    - name: Run E2E tests
      run: npm run test:e2e
      if: matrix.os == 'macos-latest'
      
    - name: Generate coverage report
      run: npm run test:coverage
      
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

## Testing Commands

```json
// package.json scripts
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e --runInBand",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:performance": "node tests/performance/run-benchmarks.js",
    "test:memory": "node --expose-gc tests/performance/memory-profile.js"
  }
}
```

## Testing Best Practices

1. **Isolation**: Each test should be independent
2. **Mocking**: Mock external dependencies (AI APIs, file system)
3. **Fixtures**: Use realistic test data
4. **Coverage**: Aim for 80%+ code coverage
5. **Performance**: Include performance benchmarks
6. **CI/CD**: Run tests on every commit
7. **Documentation**: Document complex test scenarios

## Migration Testing Checklist

- [ ] Set up Jest and testing dependencies
- [ ] Create test directory structure
- [ ] Write unit tests for all commands
- [ ] Write unit tests for transformers
- [ ] Write unit tests for pipeline stages
- [ ] Write integration tests for CLI
- [ ] Write integration tests for profiles
- [ ] Write E2E tests for common scenarios
- [ ] Add performance benchmarks
- [ ] Set up CI/CD pipeline
- [ ] Add pre-commit hooks
- [ ] Document testing procedures
- [ ] Create test data fixtures
- [ ] Add custom matchers
- [ ] Ensure 80%+ coverage