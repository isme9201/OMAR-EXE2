import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const core = require("../public/aven-upload-core.js") as {
  CHUNK_SIZE: number;
  nextRange: (offset: number, total: number) => { start: number; endExclusive: number; byteLength: number; contentRange: string; isFinal: boolean };
  isRetryableHttpStatus: (status: number) => boolean;
};

describe("Cloudinary resumable-upload protocol", () => {
  it("splits a 120 MiB video into contiguous REST chunks larger than 5 MB", () => {
    const total = 120 * 1024 * 1024;
    let offset = 0;
    let count = 0;
    const ranges: string[] = [];

    while (offset < total) {
      const part = core.nextRange(offset, total);
      const parsed = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(part.contentRange);
      expect(parsed).not.toBeNull();
      expect(Number(parsed?.[1])).toBe(offset);
      expect(Number(parsed?.[2])).toBe(part.endExclusive - 1);
      expect(Number(parsed?.[3])).toBe(total);
      expect(part.byteLength).toBe(part.endExclusive - part.start);
      if (!part.isFinal) expect(part.byteLength).toBeGreaterThan(5_000_000);
      ranges.push(part.contentRange);
      offset = part.endExclusive;
      count++;
    }

    expect(core.CHUNK_SIZE).toBeGreaterThan(5_000_000);
    expect(count).toBe(20);
    expect(offset).toBe(total);
    expect(ranges[0]).toBe(`bytes 0-${core.CHUNK_SIZE - 1}/${total}`);
    expect(ranges.at(-1)).toBe(`bytes ${total - core.CHUNK_SIZE}-${total - 1}/${total}`);
  });

  it("marks network, rate-limit, conflict, and server errors retryable, but rejects permanent client errors", () => {
    for (const status of [0, 408, 409, 420, 425, 429, 500, 502, 503]) expect(core.isRetryableHttpStatus(status)).toBe(true);
    for (const status of [400, 401, 403, 404, 410, 413]) expect(core.isRetryableHttpStatus(status)).toBe(false);
  });

  it("rejects invalid ranges rather than sending an empty or overlapping chunk", () => {
    expect(() => core.nextRange(-1, 100)).toThrow(RangeError);
    expect(() => core.nextRange(100, 100)).toThrow(RangeError);
    expect(() => core.nextRange(0, 0)).toThrow(RangeError);
  });
});
