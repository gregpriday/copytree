import baseConfig from './jest.config.js';

/**
 * Integration-only Jest configuration.
 *
 * A root-level `testMatch` does not narrow a multi-project config: Jest reads
 * each project's own `testMatch` and ignores the one at the root. Spreading the
 * base config and adding `testMatch` therefore ran the whole suite (unit, e2e,
 * real) under the name "integration", which is worse than not having the
 * command at all, because it reports a pass for tests nobody meant to select.
 *
 * Each project is narrowed individually instead, so the mocked / real split and
 * its module mapping still apply. Projects left with no integration tests are
 * dropped rather than run empty.
 */
const projects = baseConfig.projects
  .map((project) => ({
    ...project,
    // Keep only this project's own integration entries, negations included: a
    // project that explicitly excluded an integration test must keep excluding it.
    testMatch: project.testMatch.filter((pattern) => pattern.includes('tests/integration')),
    testTimeout: 30000,
  }))
  .filter((project) => project.testMatch.some((pattern) => !pattern.startsWith('!')));

export default {
  ...baseConfig,
  projects,
  // Thresholds describe the full suite; a partial run cannot meet them.
  coverageThreshold: undefined,
};
