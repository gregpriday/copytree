/**
 * Atomic replacement for every file CopyTree writes.
 *
 * The buffered path used a plain `writeFile` and the streaming path opened the
 * destination directly with `createWriteStream`. Both truncate the destination
 * the moment they start, so a run that failed or was cancelled halfway left
 * either nothing or half a document where a complete previous export used to
 * be — and the half-document is worse, because it parses far enough to look
 * like a real export.
 *
 * Everything now writes to a sibling temporary file and renames over the
 * destination once the bytes are safely on disk. `rename(2)` within a directory
 * is atomic, so a reader sees either the previous file or the complete new one,
 * never a partial write. On failure or abort the temporary file is removed and
 * the destination is left exactly as it was.
 *
 * The temporary file is created with mode `0600`. An export can carry redacted
 * secrets, source code and file paths from a private tree; a world-readable
 * temporary file in a shared directory hands all of that to any local user for
 * as long as the write takes.
 */

import path from 'path';
import { randomBytes } from 'crypto';
import fs from './fsx.js';
import { ERROR_CODES, FileSystemError } from './errors.js';
import { onceAny } from './streamEvents.js';

/** How long to wait for a destroyed stream to emit `close` before giving up. */
const CLOSE_GRACE_MS = 2000;

/** Permissions for the temporary file, and for the destination it becomes. */
const PRIVATE_FILE_MODE = 0o600;

/**
 * A collision-resistant sibling path for the in-progress write.
 *
 * A sibling rather than a system temporary directory, because `rename` is only
 * atomic within a filesystem, and `/tmp` is frequently a different one.
 *
 * @param {string} destination - Final path
 * @returns {string} Temporary path
 */
function temporaryPathFor(destination) {
  const directory = path.dirname(destination);
  const base = path.basename(destination);
  return path.join(directory, `.${base}.${randomBytes(6).toString('hex')}.partial`);
}

/**
 * Wrap a filesystem failure so the reporter can name the file and the operation.
 * @param {Error} error - Underlying failure
 * @param {string} destination - Path being written
 * @returns {FileSystemError} Typed error
 */
function writeFailure(error, destination) {
  if (error instanceof FileSystemError) return error;
  return new FileSystemError(
    `write ${destination}: ${error.message}`,
    destination,
    'write the output file',
    // The public code is `ERR_OUTPUT_WRITE`; the platform errno is kept beside
    // it as data. They are different vocabularies — `ENOENT` is not in
    // `ERROR_CODES`, has no exit-code mapping and no remediation — and putting
    // the errno in `code` left the reporter with nothing to say beyond "run
    // again with --verbose".
    { code: ERROR_CODES.OUTPUT_WRITE, errno: error.code },
  );
}

/**
 * Remove a temporary file, ignoring the failure to do so.
 *
 * A cleanup error must never replace the error that caused the cleanup.
 *
 * @param {string} temporaryPath - Path to remove
 * @returns {Promise<void>} Resolves when the attempt completes
 */
async function discard(temporaryPath) {
  try {
    await fs.remove(temporaryPath);
  } catch {
    // Nothing useful to do, and nothing useful to say.
  }
}

/**
 * Write a complete string to a path, atomically.
 *
 * @param {string} destination - Final path
 * @param {string|Buffer} data - Content to write
 * @returns {Promise<void>} Resolves once the destination is replaced
 * @throws {FileSystemError} If the write or rename fails
 */
export async function writeFileAtomic(destination, data) {
  const resolved = path.resolve(destination);
  const temporaryPath = temporaryPathFor(resolved);

  try {
    await fs.ensureDir(path.dirname(resolved));
    // `wx` for the same reason the stream path uses it: the name is
    // unpredictable, so an existing file means something else got there
    // first — which is the case worth refusing rather than truncating.
    await fs.writeFile(temporaryPath, data, { mode: PRIVATE_FILE_MODE, flag: 'wx' });
    await fs.rename(temporaryPath, resolved);
  } catch (error) {
    await discard(temporaryPath);
    throw writeFailure(error, resolved);
  }
}

/**
 * Open an atomic write stream over a destination.
 *
 * The caller writes chunks through `write()`, which respects backpressure, and
 * finishes with either `commit()` or `abort()`. Until `commit()` resolves the
 * destination is untouched.
 *
 * @param {string} destination - Final path
 * @param {Object} [options={}] - Options
 * @param {AbortSignal} [options.signal] - Abort the write and discard the temp file
 * @returns {Promise<{write: Function, commit: Function, abort: Function, path: string}>} Handle
 * @throws {FileSystemError} If the destination cannot be opened
 */
export async function openAtomicWriteStream(destination, options = {}) {
  const resolved = path.resolve(destination);
  const temporaryPath = temporaryPathFor(resolved);

  // Checked before anything is created. A caller that aborts and then opens a
  // writer would otherwise get a live stream and a temporary file that only the
  // *next* abort would clean up.
  options.signal?.throwIfAborted();

  let stream;
  try {
    await fs.ensureDir(path.dirname(resolved));
    // `wx`, not `w`: fail if the path exists. The name is unpredictable, so a
    // collision means something else created it first — which is the case worth
    // refusing rather than truncating.
    stream = fs.createWriteStream(temporaryPath, { mode: PRIVATE_FILE_MODE, flags: 'wx' });

    // One error listener for the whole life of the stream, attached before
    // anything can fail. Node turns an `error` event with no listener into an
    // uncaught exception that takes the process down, and this stream emits
    // one *after* it is finished with: destroying it while a write is still in
    // flight — which is exactly what `abort()` does — surfaces
    // `ERR_STREAM_DESTROYED` a tick later, when no per-await handler is
    // attached any more.
    //
    // This used to be covered by accident. The open handshake attached
    // `once('error', reject)` and, because `once` only detaches the listener
    // that fired, that rejector stayed on the stream forever and swallowed the
    // late error by rejecting an already-settled promise. Relying on a leaked
    // listener to keep the process alive is not a mechanism; this is.
    stream.on('error', () => {});
    await onceAny(stream, { open: 'resolve', error: 'reject' });
  } catch (error) {
    await discard(temporaryPath);
    throw writeFailure(error, resolved);
  }

  let settled = false;
  // Held so a later `abort()` awaits the cleanup a signal already started,
  // rather than returning immediately while the temporary file is still on
  // disk. Callers that abort in a `finally` deserve to know it finished.
  let cleanup = null;

  /**
   * Discard the in-progress write and leave the destination alone.
   * @returns {Promise<void>} Resolves once the temporary file is gone
   */
  const abort = async () => {
    if (cleanup) return cleanup;
    if (settled) return undefined;
    settled = true;

    cleanup = (async () => {
      // Wait for the handle to actually close before unlinking. Windows
      // refuses to remove a file with an open handle, so destroying and
      // immediately unlinking leaves the temporary file behind — the one
      // outcome this module exists to prevent.
      await new Promise((resolve) => {
        if (stream.destroyed && stream.closed) {
          resolve();
          return;
        }
        stream.once('close', resolve);
        stream.destroy();
        // A stream that never emits `close` must not hang the caller.
        setTimeout(resolve, CLOSE_GRACE_MS).unref?.();
      });
      await discard(temporaryPath);
    })();

    return cleanup;
  };

  const onAbort = () => {
    void abort();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  return {
    path: temporaryPath,

    /**
     * Write one chunk, waiting when the stream asks us to.
     * @param {string|Buffer} chunk - Chunk to write
     * @returns {Promise<void>} Resolves when the chunk is accepted
     */
    async write(chunk) {
      if (settled) throw new Error('write after the atomic stream was settled');
      if (stream.write(chunk)) return;

      // `close` as well as `drain` and `error`. An abort destroys the stream,
      // which emits `close` and never `drain` — a waiter listening for the
      // other two would hang for the rest of the process's life.
      await onceAny(stream, {
        drain: 'resolve',
        error: 'reject',
        close: () => new Error('atomic write stream closed while writing'),
      });
    },

    /**
     * Flush, close, and rename over the destination.
     * @returns {Promise<void>} Resolves once the destination is replaced
     * @throws {FileSystemError} If the flush or rename fails
     */
    async commit() {
      if (settled) throw new Error('commit after the atomic stream was settled');
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);

      try {
        const flushed = onceAny(stream, { finish: 'resolve', error: 'reject' });
        stream.end();
        await flushed;

        // Re-checked after the flush and before the rename. Marking the writer
        // settled closed the abort path, so without this an abort raised while
        // the last bytes were flushing would be ignored and the destination
        // replaced anyway — a cancelled run overwriting a good export.
        options.signal?.throwIfAborted();

        await fs.rename(temporaryPath, resolved);
      } catch (error) {
        await discard(temporaryPath);
        throw writeFailure(error, resolved);
      }
    },

    abort,
  };
}

export default { writeFileAtomic, openAtomicWriteStream };
