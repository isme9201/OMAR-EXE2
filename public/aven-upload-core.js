/* Shared protocol helpers for AVEN Media's browser and service-worker upload paths. */
(function attachAvenUploadCore(root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  root.AvenUploadCore = core;
})(typeof self !== 'undefined' ? self : globalThis, function createAvenUploadCore() {
  'use strict';
  const CHUNK_SIZE = 6 * 1024 * 1024;

  function nextRange(offset, total) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(total) || total <= 0 || offset < 0 || offset >= total) {
      throw new RangeError('Invalid chunk offset or total size');
    }
    const endExclusive = Math.min(offset + CHUNK_SIZE, total);
    return {
      start: offset,
      endExclusive,
      byteLength: endExclusive - offset,
      contentRange: `bytes ${offset}-${endExclusive - 1}/${total}`,
      isFinal: endExclusive === total,
    };
  }

  function isRetryableHttpStatus(status) {
    const value = Number(status || 0);
    return value === 0 || value === 408 || value === 409 || value === 420 || value === 425 || value === 429 || value >= 500;
  }

  return Object.freeze({ CHUNK_SIZE, nextRange, isRetryableHttpStatus });
});
