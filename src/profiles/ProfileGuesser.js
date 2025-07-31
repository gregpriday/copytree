const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * ProfileGuesser - Always returns default profile
 * Framework-specific detection has been removed in favor of using .gitignore and .copytreeignore
 */
class ProfileGuesser {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.logger = logger.child('ProfileGuesser');
  }

  /**
   * Always returns 'default' profile
   * Framework-specific profiles have been removed in favor of .gitignore/.copytreeignore
   */
  async guess() {
    this.logger.debug('Profile guessing disabled, using default profile', { path: this.projectPath });
    return 'default';
  }

  /**
   * Get detailed analysis of the project (simplified version)
   * Framework detection removed, but still provides useful project info
   */
  async analyze() {
    const analysis = {
      detectedType: 'default',
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

    // Detect languages (for informational purposes only)
    if (await this.hasFile('package.json')) analysis.languages.push('javascript');
    if (await this.hasFile('tsconfig.json')) analysis.languages.push('typescript');
    if (await this.hasFile('composer.json')) analysis.languages.push('php');
    if (await this.hasFile('requirements.txt', 'Pipfile', 'pyproject.toml')) analysis.languages.push('python');
    if (await this.hasFile('Gemfile')) analysis.languages.push('ruby');
    if (await this.hasFile('go.mod')) analysis.languages.push('go');
    if (await this.hasFile('Cargo.toml')) analysis.languages.push('rust');
    if (await this.hasFile('*.csproj', '*.sln')) analysis.languages.push('csharp');
    if (await this.hasFile('pom.xml', 'build.gradle')) analysis.languages.push('java');

    // Detect package managers (for informational purposes only)
    if (await this.hasFile('package-lock.json')) analysis.packageManagers.push('npm');
    if (await this.hasFile('yarn.lock')) analysis.packageManagers.push('yarn');
    if (await this.hasFile('pnpm-lock.yaml')) analysis.packageManagers.push('pnpm');
    if (await this.hasFile('composer.lock')) analysis.packageManagers.push('composer');
    if (await this.hasFile('Pipfile.lock')) analysis.packageManagers.push('pipenv');

    return analysis;
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



}

module.exports = ProfileGuesser;