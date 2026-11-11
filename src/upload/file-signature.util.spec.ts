import { matchesFileSignature } from './file-signature.util';

describe('matchesFileSignature', () => {
  it('recognizes JPEG, PNG and WebP image signatures', () => {
    expect(matchesFileSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true);
    expect(matchesFileSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png')).toBe(true);
    expect(matchesFileSignature(Buffer.from('RIFFxxxxWEBP'), 'image/webp')).toBe(true);
  });

  it('recognizes PDF, legacy Office and Office Open XML signatures', () => {
    expect(matchesFileSignature(Buffer.from('%PDF-1.7'), 'application/pdf')).toBe(true);
    expect(matchesFileSignature(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'application/msword')).toBe(true);
    expect(matchesFileSignature(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml')]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(matchesFileSignature(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('ppt/presentation.xml')]), 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe(true);
  });

  it('recognizes supported audio signatures', () => {
    expect(matchesFileSignature(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm')).toBe(true);
    expect(matchesFileSignature(Buffer.from('OggS'), 'audio/ogg')).toBe(true);
    expect(matchesFileSignature(Buffer.from('xxxxftypM4A '), 'audio/mp4')).toBe(true);
    expect(matchesFileSignature(Buffer.from('ID3'), 'audio/mpeg')).toBe(true);
    expect(matchesFileSignature(Buffer.from('RIFFxxxxWAVE'), 'audio/wav')).toBe(true);
  });

  it('rejects empty, malformed and MIME-mismatched content', () => {
    expect(matchesFileSignature(Buffer.alloc(0), 'image/png')).toBe(false);
    expect(matchesFileSignature(Buffer.from('not a pdf'), 'application/pdf')).toBe(false);
    expect(matchesFileSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/jpeg')).toBe(false);
    expect(matchesFileSignature(Buffer.from([0, 0, 0]), 'text/plain')).toBe(false);
  });
});
