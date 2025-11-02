// Jest is globally available, no need to import
import {
  recordRetry,
  recordGiveUp,
  recordPermanent,
  recordSuccessAfterRetry,
  summarize,
  getDetailsByPath,
  getFailedPaths,
  getPermanentErrorPaths,
  reset,
} from '../../../src/utils/fsErrorReport.js';

describe('fsErrorReport', () => {
  beforeEach(() => {
    reset();
  });

  describe('recordRetry', () => {
    it('should record retry attempts', () => {
      recordRetry('/path/to/file.txt', 'EBUSY');
      recordRetry('/path/to/file.txt', 'EBUSY');

      const summary = summarize();
      expect(summary.totalRetries).toBe(2);
    });

    it('should track retries per path', () => {
      recordRetry('/path/to/file1.txt', 'EBUSY');
      recordRetry('/path/to/file1.txt', 'EBUSY');
      recordRetry('/path/to/file2.txt', 'EPERM');

      const details = getDetailsByPath();
      expect(details.get('/path/to/file1.txt').retries).toBe(2);
      expect(details.get('/path/to/file1.txt').lastCode).toBe('EBUSY');
      expect(details.get('/path/to/file2.txt').retries).toBe(1);
      expect(details.get('/path/to/file2.txt').lastCode).toBe('EPERM');
    });
  });

  describe('recordSuccessAfterRetry', () => {
    it('should record success after retries', () => {
      recordRetry('/path/to/file.txt', 'EBUSY');
      recordRetry('/path/to/file.txt', 'EBUSY');
      recordSuccessAfterRetry('/path/to/file.txt');

      const summary = summarize();
      expect(summary.succeededAfterRetry).toBe(1);
      expect(summary.totalRetries).toBe(2);

      const details = getDetailsByPath();
      expect(details.get('/path/to/file.txt').status).toBe('ok');
    });

    it('should not count success if no retries occurred', () => {
      recordSuccessAfterRetry('/path/to/file.txt');

      const summary = summarize();
      expect(summary.succeededAfterRetry).toBe(0);
    });

    it('should not double-count success', () => {
      recordRetry('/path/to/file.txt', 'EBUSY');
      recordSuccessAfterRetry('/path/to/file.txt');
      recordSuccessAfterRetry('/path/to/file.txt'); // Called again

      const summary = summarize();
      expect(summary.succeededAfterRetry).toBe(1);
    });
  });

  describe('recordGiveUp', () => {
    it('should record failed operations after retries', () => {
      recordRetry('/path/to/file.txt', 'EBUSY');
      recordRetry('/path/to/file.txt', 'EBUSY');
      recordGiveUp('/path/to/file.txt', 'EBUSY');

      const summary = summarize();
      expect(summary.failed).toBe(1);
      expect(summary.totalRetries).toBe(2);

      const failed = getFailedPaths();
      expect(failed).toHaveLength(1);
      expect(failed[0]).toEqual({
        path: '/path/to/file.txt',
        code: 'EBUSY',
        retries: 2,
      });
    });

    it('should handle give up without prior retries', () => {
      recordGiveUp('/path/to/file.txt', 'EBUSY');

      const summary = summarize();
      expect(summary.failed).toBe(1);
      expect(summary.totalRetries).toBe(0);

      const failed = getFailedPaths();
      expect(failed[0].retries).toBe(0);
    });
  });

  describe('recordPermanent', () => {
    it('should record permanent errors', () => {
      recordPermanent('/path/to/file.txt', 'ENOENT');

      const summary = summarize();
      expect(summary.permanent).toBe(1);

      const permanent = getPermanentErrorPaths();
      expect(permanent).toHaveLength(1);
      expect(permanent[0]).toEqual({
        path: '/path/to/file.txt',
        code: 'ENOENT',
      });
    });

    it('should track multiple permanent errors', () => {
      recordPermanent('/path/to/file1.txt', 'ENOENT');
      recordPermanent('/path/to/file2.txt', 'EISDIR');

      const summary = summarize();
      expect(summary.permanent).toBe(2);

      const permanent = getPermanentErrorPaths();
      expect(permanent).toHaveLength(2);
    });
  });

  describe('summarize', () => {
    it('should provide comprehensive summary', () => {
      // Successful after retry
      recordRetry('/file1.txt', 'EBUSY');
      recordSuccessAfterRetry('/file1.txt');

      // Failed after retries
      recordRetry('/file2.txt', 'EPERM');
      recordRetry('/file2.txt', 'EPERM');
      recordGiveUp('/file2.txt', 'EPERM');

      // Permanent error
      recordPermanent('/file3.txt', 'ENOENT');

      const summary = summarize();
      expect(summary).toEqual({
        totalRetries: 3,
        succeededAfterRetry: 1,
        failed: 1,
        permanent: 1,
      });
    });

    it('should return zeros for empty state', () => {
      const summary = summarize();
      expect(summary).toEqual({
        totalRetries: 0,
        succeededAfterRetry: 0,
        failed: 0,
        permanent: 0,
      });
    });
  });

  describe('getDetailsByPath', () => {
    it('should return detailed information by path', () => {
      recordRetry('/file1.txt', 'EBUSY');
      recordRetry('/file1.txt', 'EBUSY');
      recordSuccessAfterRetry('/file1.txt');

      recordRetry('/file2.txt', 'EPERM');
      recordGiveUp('/file2.txt', 'EPERM');

      const details = getDetailsByPath();
      expect(details.size).toBe(2);

      const file1 = details.get('/file1.txt');
      expect(file1).toEqual({
        retries: 2,
        lastCode: 'EBUSY',
        status: 'ok',
      });

      const file2 = details.get('/file2.txt');
      expect(file2).toEqual({
        retries: 1,
        lastCode: 'EPERM',
        status: 'failed',
      });
    });
  });

  describe('getFailedPaths', () => {
    it('should return only failed paths', () => {
      recordRetry('/success.txt', 'EBUSY');
      recordSuccessAfterRetry('/success.txt');

      recordRetry('/failed.txt', 'EPERM');
      recordGiveUp('/failed.txt', 'EPERM');

      recordPermanent('/permanent.txt', 'ENOENT');

      const failed = getFailedPaths();
      expect(failed).toHaveLength(1);
      expect(failed[0].path).toBe('/failed.txt');
    });

    it('should include retry count in failed paths', () => {
      recordRetry('/file.txt', 'EBUSY');
      recordRetry('/file.txt', 'EBUSY');
      recordRetry('/file.txt', 'EBUSY');
      recordGiveUp('/file.txt', 'EBUSY');

      const failed = getFailedPaths();
      expect(failed[0].retries).toBe(3);
    });
  });

  describe('getPermanentErrorPaths', () => {
    it('should return only permanent error paths', () => {
      recordPermanent('/perm1.txt', 'ENOENT');
      recordPermanent('/perm2.txt', 'EISDIR');

      recordRetry('/failed.txt', 'EBUSY');
      recordGiveUp('/failed.txt', 'EBUSY');

      const permanent = getPermanentErrorPaths();
      expect(permanent).toHaveLength(2);
      expect(permanent.map((p) => p.path)).toEqual(['/perm1.txt', '/perm2.txt']);
    });
  });

  describe('reset', () => {
    it('should clear all statistics', () => {
      recordRetry('/file1.txt', 'EBUSY');
      recordSuccessAfterRetry('/file1.txt');
      recordGiveUp('/file2.txt', 'EPERM');
      recordPermanent('/file3.txt', 'ENOENT');

      reset();

      const summary = summarize();
      expect(summary).toEqual({
        totalRetries: 0,
        succeededAfterRetry: 0,
        failed: 0,
        permanent: 0,
      });

      const details = getDetailsByPath();
      expect(details.size).toBe(0);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed success and failure scenarios', () => {
      // File 1: Success after 2 retries
      recordRetry('/file1.txt', 'EBUSY');
      recordRetry('/file1.txt', 'EBUSY');
      recordSuccessAfterRetry('/file1.txt');

      // File 2: Failed after 3 retries
      recordRetry('/file2.txt', 'EPERM');
      recordRetry('/file2.txt', 'EPERM');
      recordRetry('/file2.txt', 'EPERM');
      recordGiveUp('/file2.txt', 'EPERM');

      // File 3: Permanent error (no retries)
      recordPermanent('/file3.txt', 'ENOENT');

      // File 4: Success after 1 retry
      recordRetry('/file4.txt', 'EAGAIN');
      recordSuccessAfterRetry('/file4.txt');

      const summary = summarize();
      expect(summary.totalRetries).toBe(6); // 2 + 3 + 0 + 1
      expect(summary.succeededAfterRetry).toBe(2); // file1, file4
      expect(summary.failed).toBe(1); // file2
      expect(summary.permanent).toBe(1); // file3
    });

    it('should handle Windows-style paths', () => {
      recordRetry('C:\\Windows\\System32\\file.dll', 'EBUSY');
      recordGiveUp('C:\\Windows\\System32\\file.dll', 'EBUSY');

      const failed = getFailedPaths();
      expect(failed[0].path).toBe('C:\\Windows\\System32\\file.dll');
    });

    it('should handle directory paths', () => {
      recordRetry('/path/to/directory/', 'EBUSY');
      recordSuccessAfterRetry('/path/to/directory/');

      const details = getDetailsByPath();
      expect(details.has('/path/to/directory/')).toBe(true);
    });
  });
});
