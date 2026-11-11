import { TextDecoder } from 'util';

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function isZipOfficeDocument(buffer: Buffer, family: 'word' | 'powerpoint'): boolean {
  if (!startsWith(buffer, ZIP_SIGNATURE)) return false;
  const content = buffer.toString('latin1');
  return content.includes(family === 'word' ? 'word/' : 'ppt/');
}

/** Checks file signatures; client-supplied MIME metadata alone is not trusted. */
export function matchesFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(buffer, Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/png':
      return startsWith(buffer, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'application/pdf':
      return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from('%PDF-'));
    case 'application/msword':
    case 'application/vnd.ms-powerpoint':
      return startsWith(buffer, OLE_SIGNATURE);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return isZipOfficeDocument(buffer, 'word');
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return isZipOfficeDocument(buffer, 'powerpoint');
    case 'text/plain':
      if (buffer.includes(0)) return false;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        return true;
      } catch {
        return false;
      }
    case 'audio/webm':
      return startsWith(buffer, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case 'audio/ogg':
      return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
    case 'audio/mp4':
      return buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp';
    case 'audio/mpeg':
      return buffer.length >= 3 &&
        (buffer.toString('ascii', 0, 3) === 'ID3' ||
          (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0));
    case 'audio/wav':
    case 'audio/x-wav':
      return buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WAVE';
    default:
      return false;
  }
}
