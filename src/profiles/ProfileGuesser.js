const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * ProfileGuesser - Auto-detect project type and suggest appropriate profile
 */
class ProfileGuesser {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.logger = logger.child('ProfileGuesser');
    
    // Define detectors in priority order
    this.detectors = [
      { check: this.isLaravel.bind(this), profile: 'laravel' },
      { check: this.isSvelteKit.bind(this), profile: 'sveltekit' },
      { check: this.isNextJS.bind(this), profile: 'nextjs' },
      { check: this.isReact.bind(this), profile: 'react' },
      { check: this.isVue.bind(this), profile: 'vue' },
      { check: this.isAngular.bind(this), profile: 'angular' },
      { check: this.isExpress.bind(this), profile: 'express' },
      { check: this.isNestJS.bind(this), profile: 'nestjs' },
      { check: this.isDjango.bind(this), profile: 'django' },
      { check: this.isFlask.bind(this), profile: 'flask' },
      { check: this.isRails.bind(this), profile: 'rails' },
      { check: this.isGolang.bind(this), profile: 'golang' },
      { check: this.isRust.bind(this), profile: 'rust' },
      { check: this.isDotNet.bind(this), profile: 'dotnet' }
    ];
  }

  /**
   * Guess the most appropriate profile for the project
   */
  async guess() {
    this.logger.debug('Guessing profile for project', { path: this.projectPath });
    
    for (const detector of this.detectors) {
      try {
        if (await detector.check()) {
          this.logger.info('Detected project type', { 
            profile: detector.profile,
            path: this.projectPath 
          });
          return detector.profile;
        }
      } catch (error) {
        this.logger.warn('Detector failed', { 
          profile: detector.profile,
          error: error.message 
        });
      }
    }
    
    // If no specific framework detected, try to guess by language
    const language = await this.detectPrimaryLanguage();
    if (language) {
      this.logger.info('Detected primary language', { language });
      return language;
    }
    
    return 'default';
  }

  /**
   * Get detailed analysis of the project
   */
  async analyze() {
    const analysis = {
      detectedType: await this.guess(),
      frameworks: [],
      languages: [],
      buildTools: [],
      testFrameworks: [],
      hasDocker: await this.hasFile('Dockerfile', 'docker-compose.yml'),
      hasCI: await this.hasAnyFile(['.github/workflows', '.gitlab-ci.yml', '.circleci', 'Jenkinsfile']),
      hasTests: await this.hasAnyDirectory(['test', 'tests', '__tests__', 'spec']),
      hasDocs: await this.hasAnyDirectory(['docs', 'documentation']),
      packageManagers: []
    };

    // Check for various frameworks
    for (const detector of this.detectors) {
      if (await detector.check()) {
        analysis.frameworks.push(detector.profile);
      }
    }

    // Detect languages
    if (await this.hasFile('package.json')) analysis.languages.push('javascript');
    if (await this.hasFile('tsconfig.json')) analysis.languages.push('typescript');
    if (await this.hasFile('composer.json')) analysis.languages.push('php');
    if (await this.hasFile('requirements.txt', 'Pipfile', 'pyproject.toml')) analysis.languages.push('python');
    if (await this.hasFile('Gemfile')) analysis.languages.push('ruby');
    if (await this.hasFile('go.mod')) analysis.languages.push('go');
    if (await this.hasFile('Cargo.toml')) analysis.languages.push('rust');
    if (await this.hasFile('*.csproj', '*.sln')) analysis.languages.push('csharp');
    if (await this.hasFile('pom.xml', 'build.gradle')) analysis.languages.push('java');

    // Detect package managers
    if (await this.hasFile('package-lock.json')) analysis.packageManagers.push('npm');
    if (await this.hasFile('yarn.lock')) analysis.packageManagers.push('yarn');
    if (await this.hasFile('pnpm-lock.yaml')) analysis.packageManagers.push('pnpm');
    if (await this.hasFile('composer.lock')) analysis.packageManagers.push('composer');
    if (await this.hasFile('Pipfile.lock')) analysis.packageManagers.push('pipenv');

    return analysis;
  }

  // Framework detection methods

  async isLaravel() {
    return await this.hasFile('artisan') && 
           await this.hasComposerPackage('laravel/framework');
  }

  async isSvelteKit() {
    return await this.hasFile('svelte.config.js') &&
           await this.hasNpmPackage('@sveltejs/kit');
  }

  async isNextJS() {
    return await this.hasFile('next.config.js', 'next.config.mjs') ||
           await this.hasNpmPackage('next');
  }

  async isReact() {
    return await this.hasNpmPackage('react') &&
           !await this.isNextJS(); // Next.js is more specific
  }

  async isVue() {
    return await this.hasFile('vue.config.js') ||
           await this.hasNpmPackage('vue');
  }

  async isAngular() {
    return await this.hasFile('angular.json') ||
           await this.hasNpmPackage('@angular/core');
  }

  async isExpress() {
    return await this.hasNpmPackage('express') &&
           !await this.isNestJS(); // NestJS uses Express
  }

  async isNestJS() {
    return await this.hasFile('nest-cli.json') ||
           await this.hasNpmPackage('@nestjs/core');
  }

  async isDjango() {
    return await this.hasFile('manage.py') &&
           await this.hasFileContent('manage.py', 'django');
  }

  async isFlask() {
    return await this.hasPythonImport('flask') ||
           await this.hasPythonPackage('Flask');
  }

  async isRails() {
    return await this.hasFile('Gemfile') &&
           await this.hasFileContent('Gemfile', 'rails');
  }

  async isGolang() {
    return await this.hasFile('go.mod');
  }

  async isRust() {
    return await this.hasFile('Cargo.toml');
  }

  async isDotNet() {
    return await this.hasFile('*.csproj', '*.sln');
  }

  // Helper methods

  async hasFile(...fileNames) {
    for (const fileName of fileNames) {
      if (fileName.includes('*')) {
        // Handle glob patterns
        const files = await fs.readdir(this.projectPath);
        const pattern = new RegExp(fileName.replace('*', '.*'));
        if (files.some(f => pattern.test(f))) {
          return true;
        }
      } else {
        const filePath = path.join(this.projectPath, fileName);
        if (await fs.pathExists(filePath)) {
          return true;
        }
      }
    }
    return false;
  }

  async hasAnyFile(fileNames) {
    for (const fileName of fileNames) {
      if (await this.hasFile(fileName)) {
        return true;
      }
    }
    return false;
  }

  async hasAnyDirectory(dirNames) {
    for (const dirName of dirNames) {
      const dirPath = path.join(this.projectPath, dirName);
      if (await fs.pathExists(dirPath)) {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          return true;
        }
      }
    }
    return false;
  }

  async hasFileContent(fileName, searchString) {
    try {
      const filePath = path.join(this.projectPath, fileName);
      const content = await fs.readFile(filePath, 'utf8');
      return content.includes(searchString);
    } catch (error) {
      return false;
    }
  }

  async hasNpmPackage(packageName) {
    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const packageJson = await fs.readJson(packageJsonPath);
      
      return (packageJson.dependencies && packageJson.dependencies[packageName]) ||
             (packageJson.devDependencies && packageJson.devDependencies[packageName]);
    } catch (error) {
      return false;
    }
  }

  async hasComposerPackage(packageName) {
    try {
      const composerJsonPath = path.join(this.projectPath, 'composer.json');
      const composerJson = await fs.readJson(composerJsonPath);
      
      return (composerJson.require && composerJson.require[packageName]) ||
             (composerJson['require-dev'] && composerJson['require-dev'][packageName]);
    } catch (error) {
      return false;
    }
  }

  async hasPythonPackage(packageName) {
    // Check requirements.txt
    const reqPath = path.join(this.projectPath, 'requirements.txt');
    if (await fs.pathExists(reqPath)) {
      const content = await fs.readFile(reqPath, 'utf8');
      if (content.toLowerCase().includes(packageName.toLowerCase())) {
        return true;
      }
    }

    // Check Pipfile
    const pipfilePath = path.join(this.projectPath, 'Pipfile');
    if (await fs.pathExists(pipfilePath)) {
      const content = await fs.readFile(pipfilePath, 'utf8');
      if (content.includes(packageName)) {
        return true;
      }
    }

    return false;
  }

  async hasPythonImport(moduleName) {
    // Simple check for Python imports in common files
    const pythonFiles = ['app.py', 'main.py', 'manage.py', '__init__.py'];
    
    for (const file of pythonFiles) {
      if (await this.hasFileContent(file, `import ${moduleName}`) ||
          await this.hasFileContent(file, `from ${moduleName}`)) {
        return true;
      }
    }
    
    return false;
  }

  async detectPrimaryLanguage() {
    const languageDetectors = [
      { check: () => this.hasFile('package.json'), language: 'javascript' },
      { check: () => this.hasFile('composer.json'), language: 'php' },
      { check: () => this.hasFile('requirements.txt', 'setup.py'), language: 'python' },
      { check: () => this.hasFile('Gemfile'), language: 'ruby' },
      { check: () => this.hasFile('go.mod'), language: 'go' },
      { check: () => this.hasFile('Cargo.toml'), language: 'rust' },
      { check: () => this.hasFile('*.csproj'), language: 'csharp' },
      { check: () => this.hasFile('pom.xml', 'build.gradle'), language: 'java' }
    ];

    for (const detector of languageDetectors) {
      if (await detector.check()) {
        return detector.language;
      }
    }

    return null;
  }
}

module.exports = ProfileGuesser;