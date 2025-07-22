const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');
const copyCommand = require('../../src/commands/copy');

/**
 * Performance benchmarking tool for CopyTree
 */
class CopyTreeBenchmark {
  constructor() {
    this.results = [];
    this.tempDir = null;
  }

  /**
   * Create test project with specified characteristics
   */
  async createTestProject(options = {}) {
    const {
      name = 'benchmark-project',
      fileCount = 100,
      directoryDepth = 3,
      averageFileSize = 1024,
      fileTypes = ['.js', '.md', '.json', '.txt', '.css'],
      includeImages = false,
      includeLargeFiles = false
    } = options;

    const projectPath = path.join(this.tempDir, name);
    await fs.ensureDir(projectPath);

    console.log(`Creating test project: ${name}`);
    console.log(`  Files: ${fileCount}, Depth: ${directoryDepth}, Avg Size: ${averageFileSize} bytes`);

    // Generate directory structure
    const dirs = this.generateDirectoryStructure(directoryDepth);
    for (const dir of dirs) {
      await fs.ensureDir(path.join(projectPath, dir));
    }

    // Generate files
    let filesCreated = 0;
    const targetFilesPerDir = Math.ceil(fileCount / dirs.length);
    
    for (const dir of dirs) {
      for (let i = 0; i < targetFilesPerDir && filesCreated < fileCount; i++) {
        const fileType = fileTypes[Math.floor(Math.random() * fileTypes.length)];
        const fileName = `file${i}${fileType}`;
        const filePath = path.join(projectPath, dir, fileName);
        
        let content;
        if (fileType === '.json') {
          content = JSON.stringify({
            id: filesCreated,
            name: `File ${filesCreated}`,
            description: 'Test file for benchmarking',
            data: new Array(Math.floor(averageFileSize / 50)).fill('x').join('')
          }, null, 2);
        } else if (fileType === '.md') {
          content = `# File ${filesCreated}\n\nThis is a test markdown file.\n\n${
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(
              Math.floor(averageFileSize / 50)
            )
          }`;
        } else if (fileType === '.js') {
          content = `// File ${filesCreated}\n\nfunction test${filesCreated}() {\n  return "${
            'x'.repeat(averageFileSize - 50)
          }";\n}\n\nmodule.exports = test${filesCreated};`;
        } else {
          content = 'x'.repeat(averageFileSize);
        }

        await fs.writeFile(filePath, content);
        filesCreated++;
      }
    }

    // Add large files if requested
    if (includeLargeFiles) {
      const largeFilePath = path.join(projectPath, 'large-file.txt');
      const largeContent = 'Large file content. '.repeat(100000); // ~2MB
      await fs.writeFile(largeFilePath, largeContent);
    }

    // Add binary images if requested
    if (includeImages) {
      const imagePath = path.join(projectPath, 'test-image.png');
      // Create a small fake PNG (just header bytes)
      const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      await fs.writeFile(imagePath, pngHeader);
    }

    // Add package.json
    await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      description: `Benchmark project with ${fileCount} files`,
    }, null, 2));

    console.log(`Created ${filesCreated} files in ${dirs.length} directories`);
    return projectPath;
  }

  /**
   * Generate directory structure
   */
  generateDirectoryStructure(depth, prefix = '') {
    if (depth === 0) return [prefix || '.'];
    
    const dirs = [];
    const dirNames = ['src', 'lib', 'tests', 'docs', 'utils', 'components'];
    
    for (let i = 0; i < Math.min(3, dirNames.length); i++) {
      const dirName = dirNames[i];
      const fullPath = prefix ? `${prefix}/${dirName}` : dirName;
      dirs.push(fullPath);
      
      if (depth > 1) {
        dirs.push(...this.generateDirectoryStructure(depth - 1, fullPath));
      }
    }
    
    return dirs;
  }

  /**
   * Run a single benchmark
   */
  async runBenchmark(name, testFn) {
    console.log(`\nRunning benchmark: ${name}`);
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    let result;
    let error = null;
    
    try {
      result = await testFn();
    } catch (err) {
      error = err;
    }
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    const duration = endTime - startTime;
    const memoryDelta = {
      rss: endMemory.rss - startMemory.rss,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
    };

    const benchmarkResult = {
      name,
      duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
      memory: memoryDelta,
      error: error ? error.message : null,
      result,
      timestamp: new Date().toISOString()
    };

    this.results.push(benchmarkResult);
    
    console.log(`  Duration: ${benchmarkResult.duration}ms`);
    console.log(`  Memory: RSS ${this.formatBytes(memoryDelta.rss)}, Heap ${this.formatBytes(memoryDelta.heapUsed)}`);
    if (error) {
      console.log(`  Error: ${error.message}`);
    }
    
    return benchmarkResult;
  }

  /**
   * Run copy command benchmarks
   */
  async runCopyBenchmarks() {
    console.log('=== Copy Command Benchmarks ===');
    
    // Small project benchmark
    const smallProject = await this.createTestProject({
      name: 'small-project',
      fileCount: 10,
      directoryDepth: 2,
      averageFileSize: 500
    });

    await this.runBenchmark('Copy Small Project (10 files)', async () => {
      const outputFile = path.join(this.tempDir, 'small-output.xml');
      await copyCommand(smallProject, { output: outputFile });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    // Medium project benchmark
    const mediumProject = await this.createTestProject({
      name: 'medium-project',
      fileCount: 100,
      directoryDepth: 3,
      averageFileSize: 1024
    });

    await this.runBenchmark('Copy Medium Project (100 files)', async () => {
      const outputFile = path.join(this.tempDir, 'medium-output.xml');
      await copyCommand(mediumProject, { output: outputFile });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    // Large project benchmark
    const largeProject = await this.createTestProject({
      name: 'large-project',
      fileCount: 500,
      directoryDepth: 4,
      averageFileSize: 2048,
      includeLargeFiles: true
    });

    await this.runBenchmark('Copy Large Project (500+ files)', async () => {
      const outputFile = path.join(this.tempDir, 'large-output.xml');
      await copyCommand(largeProject, { output: outputFile });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    // Different output formats
    await this.runBenchmark('Copy with JSON Output', async () => {
      const outputFile = path.join(this.tempDir, 'json-output.json');
      await copyCommand(smallProject, { output: outputFile, format: 'json' });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('Copy with Tree Output', async () => {
      await copyCommand(smallProject, { format: 'tree', output: false });
      return {};
    });
  }

  /**
   * Run filtering benchmarks
   */
  async runFilteringBenchmarks() {
    console.log('\n=== Filtering Benchmarks ===');
    
    const project = await this.createTestProject({
      name: 'filter-project',
      fileCount: 200,
      directoryDepth: 3,
      averageFileSize: 1024,
      fileTypes: ['.js', '.md', '.json', '.txt', '.css', '.html']
    });

    await this.runBenchmark('Include Pattern (*.js)', async () => {
      const outputFile = path.join(this.tempDir, 'js-only.xml');
      await copyCommand(project, { 
        output: outputFile, 
        include: ['*.js'] 
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('Exclude Pattern (*.json)', async () => {
      const outputFile = path.join(this.tempDir, 'no-json.xml');
      await copyCommand(project, { 
        output: outputFile, 
        exclude: ['*.json'] 
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('Complex Filtering', async () => {
      const outputFile = path.join(this.tempDir, 'complex-filter.xml');
      await copyCommand(project, { 
        output: outputFile, 
        include: ['src/**/*.js', '*.md'],
        exclude: ['**/*.test.js']
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });
  }

  /**
   * Run transformation benchmarks
   */
  async runTransformationBenchmarks() {
    console.log('\n=== Transformation Benchmarks ===');
    
    const project = await this.createTestProject({
      name: 'transform-project',
      fileCount: 50,
      directoryDepth: 2,
      averageFileSize: 2048,
      fileTypes: ['.js', '.md', '.json', '.txt', '.css']
    });

    // Test parallel transformations
    await this.runBenchmark('Transformations - Sequential', async () => {
      const outputFile = path.join(this.tempDir, 'transform-seq.xml');
      await copyCommand(project, { 
        output: outputFile,
        transform: true,
        maxConcurrency: 1  // Force sequential
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('Transformations - Parallel (5)', async () => {
      const outputFile = path.join(this.tempDir, 'transform-par5.xml');
      await copyCommand(project, { 
        output: outputFile,
        transform: true,
        maxConcurrency: 5  // Default parallel
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('Transformations - Parallel (10)', async () => {
      const outputFile = path.join(this.tempDir, 'transform-par10.xml');
      await copyCommand(project, { 
        output: outputFile,
        transform: true,
        maxConcurrency: 10  // High parallel
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    // Test with caching
    await this.runBenchmark('Transformations - With Cache (1st run)', async () => {
      const outputFile = path.join(this.tempDir, 'transform-cache1.xml');
      await copyCommand(project, { 
        output: outputFile,
        transform: true,
        cacheEnabled: true
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('Transformations - With Cache (2nd run)', async () => {
      const outputFile = path.join(this.tempDir, 'transform-cache2.xml');
      await copyCommand(project, { 
        output: outputFile,
        transform: true,
        cacheEnabled: true
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });
  }

  /**
   * Run performance optimization benchmarks
   */
  async runOptimizationBenchmarks() {
    console.log('\n=== Optimization Benchmarks ===');
    
    const largeProject = await this.createTestProject({
      name: 'optimization-project',
      fileCount: 1000,
      directoryDepth: 5,
      averageFileSize: 1024,
      includeLargeFiles: true
    });

    // Test optimized file discovery
    await this.runBenchmark('File Discovery - Standard', async () => {
      const outputFile = path.join(this.tempDir, 'discovery-standard.xml');
      await copyCommand(largeProject, { 
        output: outputFile,
        optimizedDiscovery: false
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('File Discovery - Optimized', async () => {
      const outputFile = path.join(this.tempDir, 'discovery-optimized.xml');
      await copyCommand(largeProject, { 
        output: outputFile,
        optimizedDiscovery: true
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    // Test streaming performance
    await this.runBenchmark('Output - Buffered', async () => {
      const outputFile = path.join(this.tempDir, 'output-buffered.xml');
      await copyCommand(largeProject, { 
        output: outputFile,
        streaming: false
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });

    await this.runBenchmark('Output - Streaming', async () => {
      const outputFile = path.join(this.tempDir, 'output-streaming.xml');
      await copyCommand(largeProject, { 
        output: outputFile,
        streaming: true
      });
      const stats = await fs.stat(outputFile);
      return { outputSize: stats.size };
    });
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    const sign = bytes < 0 ? '-' : '';
    return `${sign}${Math.round(value * 100) / 100} ${sizes[i]}`;
  }

  /**
   * Generate performance report
   */
  generateReport() {
    console.log('\n=== Performance Report ===');
    
    const totalTests = this.results.length;
    const failedTests = this.results.filter(r => r.error).length;
    const successfulTests = totalTests - failedTests;
    
    console.log(`Total tests: ${totalTests}`);
    console.log(`Successful: ${successfulTests}`);
    console.log(`Failed: ${failedTests}`);
    
    if (successfulTests > 0) {
      const successfulResults = this.results.filter(r => !r.error);
      const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
      const totalMemoryUsed = successfulResults.reduce((sum, r) => sum + Math.max(0, r.memory.heapUsed), 0);
      
      console.log(`Average duration: ${Math.round(avgDuration * 100) / 100}ms`);
      console.log(`Total memory used: ${this.formatBytes(totalMemoryUsed)}`);
    }

    // Performance targets
    console.log('\n=== Performance Analysis ===');
    const smallProjectResult = this.results.find(r => r.name.includes('Small Project'));
    const mediumProjectResult = this.results.find(r => r.name.includes('Medium Project'));
    const largeProjectResult = this.results.find(r => r.name.includes('Large Project'));

    if (smallProjectResult) {
      console.log(`Small project (10 files): ${smallProjectResult.duration}ms ${smallProjectResult.duration < 1000 ? '✓' : '⚠'}`);
    }
    if (mediumProjectResult) {
      console.log(`Medium project (100 files): ${mediumProjectResult.duration}ms ${mediumProjectResult.duration < 5000 ? '✓' : '⚠'}`);
    }
    if (largeProjectResult) {
      console.log(`Large project (500+ files): ${largeProjectResult.duration}ms ${largeProjectResult.duration < 30000 ? '✓' : '⚠'}`);
    }

    // Optimization impact analysis
    console.log('\n=== Optimization Impact ===');
    
    // Parallel transformation analysis
    const seqTransform = this.results.find(r => r.name.includes('Sequential'));
    const par5Transform = this.results.find(r => r.name.includes('Parallel (5)'));
    const par10Transform = this.results.find(r => r.name.includes('Parallel (10)'));
    
    if (seqTransform && par5Transform) {
      const speedup5 = ((seqTransform.duration - par5Transform.duration) / seqTransform.duration * 100).toFixed(1);
      console.log(`Parallel transformations (5): ${speedup5}% faster`);
    }
    if (seqTransform && par10Transform) {
      const speedup10 = ((seqTransform.duration - par10Transform.duration) / seqTransform.duration * 100).toFixed(1);
      console.log(`Parallel transformations (10): ${speedup10}% faster`);
    }
    
    // Cache impact analysis
    const cache1 = this.results.find(r => r.name.includes('Cache (1st run)'));
    const cache2 = this.results.find(r => r.name.includes('Cache (2nd run)'));
    
    if (cache1 && cache2) {
      const cacheSpeedup = ((cache1.duration - cache2.duration) / cache1.duration * 100).toFixed(1);
      console.log(`Transformation caching: ${cacheSpeedup}% faster on cached run`);
    }
    
    // Discovery optimization analysis
    const standardDiscovery = this.results.find(r => r.name.includes('Discovery - Standard'));
    const optimizedDiscovery = this.results.find(r => r.name.includes('Discovery - Optimized'));
    
    if (standardDiscovery && optimizedDiscovery) {
      const discoverySpeedup = ((standardDiscovery.duration - optimizedDiscovery.duration) / standardDiscovery.duration * 100).toFixed(1);
      console.log(`File discovery optimization: ${discoverySpeedup}% faster`);
    }
    
    // Streaming impact analysis
    const bufferedOutput = this.results.find(r => r.name.includes('Output - Buffered'));
    const streamingOutput = this.results.find(r => r.name.includes('Output - Streaming'));
    
    if (bufferedOutput && streamingOutput) {
      const memoryReduction = ((bufferedOutput.memory.heapUsed - streamingOutput.memory.heapUsed) / bufferedOutput.memory.heapUsed * 100).toFixed(1);
      console.log(`Streaming output: ${memoryReduction}% less memory used`);
    }

    // Memory analysis
    const highMemoryTests = this.results.filter(r => r.memory.heapUsed > 50 * 1024 * 1024); // 50MB
    if (highMemoryTests.length > 0) {
      console.log('\n⚠ High memory usage detected:');
      highMemoryTests.forEach(test => {
        console.log(`  ${test.name}: ${this.formatBytes(test.memory.heapUsed)}`);
      });
    }

    return {
      summary: {
        totalTests,
        successfulTests,
        failedTests,
        avgDuration: successfulTests > 0 ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length : 0
      },
      results: this.results
    };
  }

  /**
   * Run all benchmarks
   */
  async run() {
    console.log('CopyTree Performance Benchmark');
    console.log('==============================');
    console.log(`Node.js: ${process.version}`);
    console.log(`Platform: ${os.platform()} ${os.arch()}`);
    console.log(`CPUs: ${os.cpus().length} x ${os.cpus()[0].model}`);
    console.log(`Memory: ${this.formatBytes(os.totalmem())}`);
    console.log('');
    
    // Setup
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-benchmark-'));
    console.log(`Using temp directory: ${this.tempDir}`);

    try {
      await this.runCopyBenchmarks();
      await this.runFilteringBenchmarks();
      await this.runTransformationBenchmarks();
      await this.runOptimizationBenchmarks();
      
      const report = this.generateReport();
      
      // Save detailed results
      const reportFile = path.join(this.tempDir, 'benchmark-report.json');
      await fs.writeJson(reportFile, report, { spaces: 2 });
      console.log(`\nDetailed report saved to: ${reportFile}`);
      
      return report;
    } finally {
      // Cleanup
      if (this.tempDir && await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir);
      }
    }
  }
}

// Run benchmarks if called directly
if (require.main === module) {
  const benchmark = new CopyTreeBenchmark();
  benchmark.run().catch(console.error);
}

module.exports = CopyTreeBenchmark;