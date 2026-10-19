import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUDINARY_CHUNK_SIZE, uploadCloudinaryChunks } from '../lib/cloudinary-chunked-upload';

const signed = {
  cloudName: 'test-cloud',
  apiKey: 'test-key',
  timestamp: 1_765_000_000,
  signature: 'test-signature',
  folder: 'avenmedia/chat/test',
  publicId: 'message-test',
  resourceType: 'raw',
};

afterEach(() => vi.unstubAllGlobals());

describe('chat attachment chunk upload', () => {
  it('sends contiguous chunks with the same resumable upload id and returns the final asset', async () => {
    const total = CLOUDINARY_CHUNK_SIZE + 1;
    const file = new File([new Uint8Array(total)], 'large.bin', { type: 'application/octet-stream' });
    const finalAsset = { public_id: 'avenmedia/chat/test/message-test', secure_url: 'https://res.cloudinary.com/test/raw/upload/file.bin', resource_type: 'raw', bytes: total };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ done: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(finalAsset), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const progress: number[] = [];

    const result = await uploadCloudinaryChunks(file, signed, value => progress.push(value.percent), { uploadId: 'stable-upload-id' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => (call[1] as RequestInit).headers)).toEqual([
      { 'Content-Range': `bytes 0-${CLOUDINARY_CHUNK_SIZE - 1}/${total}`, 'X-Unique-Upload-Id': 'stable-upload-id' },
      { 'Content-Range': `bytes ${CLOUDINARY_CHUNK_SIZE}-${total - 1}/${total}`, 'X-Unique-Upload-Id': 'stable-upload-id' },
    ]);
    expect(result).toEqual(finalAsset);
    expect(progress.at(-1)).toBe(100);
  });

  it('retries retryable server errors without changing the unique upload id', async () => {
    const file = new File(['data'], 'small.txt', { type: 'text/plain' });
    const asset = { secure_url: 'https://res.cloudinary.com/test/raw/upload/small.txt' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporary failure', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(asset), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadCloudinaryChunks(file, signed, undefined, { uploadId: 'retry-upload-id', maxRetries: 2 })).resolves.toEqual(asset);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => ((call[1] as RequestInit).headers as Record<string, string>)['X-Unique-Upload-Id'])).toEqual(['retry-upload-id', 'retry-upload-id']);
  });

  it('rejects an empty attachment before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const empty = new File([], 'empty.txt');

    await expect(uploadCloudinaryChunks(empty, signed, undefined, { uploadId: 'empty-upload-id' })).rejects.toThrow('لا يمكن رفع ملف فارغ');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
