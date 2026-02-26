import inspector from 'inspector';
import fs from 'fs-extra';
import path from 'path';

const VALID_TYPES = ['cpu', 'heap', 'all'];

/**
 * Built-in profiling harness using Node.js inspector API.
 * Captures CPU and/or heap profiles and writes them to .cpuprofile/.heapprofile files.
 */
export class Profiler {
  /**
   * @param {Object} options
   * @param {string} options.type - Profiling type: 'cpu', 'heap', or 'all'
   * @param {string} options.profileDir - Output directory (default: '.profiles')
   * @param {Object} [options._session] - Injectable inspector session (for testing)
   */
  constructor(options = {}) {
    const type = (options.type || 'cpu').toLowerCase();
    if (!VALID_TYPES.includes(type)) {
      throw new Error(`Invalid profile type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`);
    }

    this.type = type;
    this.profileDir = options.profileDir || '.profiles';
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.session = options._session || new inspector.Session();
    this._started = false;
  }

  /**
   * Start profiling. Must be called before the operation to measure.
   */
  async start() {
    this.session.connect();
    this._started = true;

    try {
      if (this.type === 'cpu' || this.type === 'all') {
        await this._post('Profiler.enable');
        await this._post('Profiler.start');
      }

      if (this.type === 'heap' || this.type === 'all') {
        await this._post('HeapProfiler.enable');
        await this._post('HeapProfiler.startSampling');
      }
    } catch (err) {
      // Rollback: disconnect and reset state so callers don't get a zombie session
      this.session.disconnect();
      this._started = false;
      throw err;
    }
  }

  /**
   * Stop profiling and write profile files to disk.
   * @returns {Object} Map of profile type to file path (e.g., { cpu: '.profiles/...-cpu.cpuprofile' })
   */
  async stop() {
    const results = {};

    try {
      await fs.ensureDir(this.profileDir);

      if (this.type === 'cpu' || this.type === 'all') {
        const { profile } = await this._post('Profiler.stop');
        const cpuPath = path.join(this.profileDir, `${this.timestamp}-cpu.cpuprofile`);
        await fs.writeJson(cpuPath, profile);
        results.cpu = cpuPath;
      }

      if (this.type === 'heap' || this.type === 'all') {
        const { profile } = await this._post('HeapProfiler.stopSampling');
        const heapPath = path.join(this.profileDir, `${this.timestamp}-heap.heapprofile`);
        await fs.writeJson(heapPath, profile);
        results.heap = heapPath;
      }
    } finally {
      if (this._started) {
        this.session.disconnect();
        this._started = false;
      }
    }

    return results;
  }

  /**
   * Promisify inspector session.post()
   * @private
   */
  _post(method, params = {}) {
    return new Promise((resolve, reject) => {
      this.session.post(method, params, (err, result) => {
        if (err) reject(err);
        else resolve(result || {});
      });
    });
  }
}

/**
 * Build and write a JSON performance report.
 *
 * @param {Object} options
 * @param {string} options.profileDir - Output directory
 * @param {string} options.timestamp - Shared timestamp string from Profiler
 * @param {number} options.duration - Total duration in milliseconds
 * @param {string} options.version - Package version
 * @param {string} options.command - Original CLI command string
 * @param {Object} options.files - File stats (total, processed, excluded)
 * @param {Object} options.memory - process.memoryUsage() snapshot
 * @param {Object} options.perStageTimings - Stage name → duration (ms)
 * @param {Object} options.perStageMetrics - Stage name → metrics object
 * @param {Object} options.profileFiles - Map of type → file path
 * @returns {string} Path to the written report file
 */
export async function writeProfilingReport({
  profileDir,
  timestamp,
  duration,
  version,
  command,
  files,
  memory,
  perStageTimings = {},
  perStageMetrics = {},
  profileFiles = {},
}) {
  await fs.ensureDir(profileDir);

  const stages = Object.entries(perStageTimings).map(([name, stageDuration]) => ({
    name,
    duration: stageDuration,
    memoryDelta: perStageMetrics[name]?.memoryUsage?.delta?.heapUsed ?? 0,
  }));

  const report = {
    timestamp: new Date().toISOString(),
    version,
    command,
    duration,
    files,
    memory,
    stages,
    profileFiles,
  };

  const reportPath = path.join(profileDir, `${timestamp}-report.json`);
  await fs.writeJson(reportPath, report, { spaces: 2 });
  return reportPath;
}
