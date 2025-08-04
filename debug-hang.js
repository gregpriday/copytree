#!/usr/bin/env node

// Register ESM loader for JSX support using modern Node.js API
try {
  const { register } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  register('@esbuild-kit/esm-loader', pathToFileURL('./'));
} catch (error) {
  console.warn('Using legacy ESM loader API');
}

console.log('1. Starting debug');

try {
  console.log('2. Importing modules');
  const ProfileLoader = (await import('./src/profiles/ProfileLoader.js')).default;
  const Pipeline = (await import('./src/pipeline/Pipeline.js')).default;
  
  console.log('3. Creating ProfileLoader');
  const profileLoader = new ProfileLoader();
  
  console.log('4. Loading default profile');
  const profile = await profileLoader.load('default');
  console.log('5. Profile loaded:', profile.name);
  
  console.log('6. Creating Pipeline');
  const pipeline = new Pipeline({
    continueOnError: true,
    emitProgress: true,
  });
  
  console.log('7. Loading FileDiscoveryStage');
  const { default: FileDiscoveryStage } = await import('./src/pipeline/stages/FileDiscoveryStage.js');
  
  console.log('8. Creating FileDiscoveryStage');
  const fileDiscovery = new FileDiscoveryStage({
    basePath: '/tmp',
    patterns: ['*'],
    respectGitignore: true,
    includeHidden: false,
    followSymlinks: false,
    maxFileSize: 10 * 1024 * 1024,
    maxTotalSize: 100 * 1024 * 1024,
    maxFileCount: 10,
  });
  
  console.log('9. Adding stage to pipeline');
  pipeline.through([fileDiscovery]);
  
  console.log('10. Processing pipeline');
  const result = await pipeline.process({
    basePath: '/tmp',
    profile: profile,
    options: { dryRun: true },
    startTime: Date.now(),
  });
  
  console.log('11. Pipeline complete, files found:', result.files.length);
  console.log('12. Exiting');
  process.exit(0);
  
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}