import { describe, expect, it } from 'vitest';
import { cloudinaryAttachmentDownloadUrl } from '../lib/cloudinary-download';

describe('cloudinaryAttachmentDownloadUrl', () => {
  it('adds a named attachment flag before the version segment', () => {
    const source = 'https://res.cloudinary.com/demo/image/upload/v123/folder/clip.mp4?token=abc';
    const result = new URL(cloudinaryAttachmentDownloadUrl(source, 'My clip.mp4'));
    expect(result.pathname).toBe('/demo/image/upload/fl_attachment:My%20clip/v123/folder/clip.mp4');
    expect(result.search).toBe('?token=abc');
  });

  it('does not alter non-Cloudinary or signed Cloudinary URLs', () => {
    const external = 'https://files.example.com/video.mp4';
    const signed = 'https://res.cloudinary.com/demo/s--signature--/image/upload/v123/clip.mp4';
    expect(cloudinaryAttachmentDownloadUrl(external, 'clip.mp4')).toBe(external);
    expect(cloudinaryAttachmentDownloadUrl(signed, 'clip.mp4')).toBe(signed);
  });

  it('does not duplicate an existing attachment flag and sanitizes the chosen filename', () => {
    const existing = 'https://res.cloudinary.com/demo/image/upload/fl_attachment:old/v123/clip.mp4';
    expect(cloudinaryAttachmentDownloadUrl(existing, 'clip.mp4')).toBe(existing);

    const source = 'https://res.cloudinary.com/demo/image/upload/v123/clip.mp4';
    const result = new URL(cloudinaryAttachmentDownloadUrl(source, '../clip?.mp4'));
    expect(result.pathname).toContain('fl_attachment:___clip_');
  });
});
