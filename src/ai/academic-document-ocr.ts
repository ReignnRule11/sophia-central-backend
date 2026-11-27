import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { extractAcademicDocumentText } from './resource-content-extractor';

const execFileAsync = promisify(execFile);
export const MAX_ACADEMIC_PDF_PAGES = 30;
export const MAX_OCR_PROCESSING_MS = 60_000;
const PDF_INFO_TIMEOUT_MS = 5_000;
const MIN_EMBEDDED_TEXT_LENGTH = 120;
const MAX_EXTRACTED_TEXT_LENGTH = 48_000;

async function run(command: string, args: string[], timeout: number): Promise<string> {
  const result = await execFileAsync(command, args, {
    encoding: 'utf8',
    timeout: Math.max(1, timeout),
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout;
}

function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function isImageExtension(extension: string): boolean {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
}

/**
 * Uses direct text extraction first. OCR is invoked only for PDFs without a
 * meaningful text layer, or for supported image uploads.
 */
export async function extractAcademicDocumentTextWithOcr(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const extension = extensionOf(filename);
  if (extension !== 'pdf' && !isImageExtension(extension)) {
    return extractAcademicDocumentText(buffer, filename).slice(0, MAX_EXTRACTED_TEXT_LENGTH);
  }

  const startedAt = Date.now();
  const directory = await mkdtemp(path.join(tmpdir(), 'sophis-ocr-'));
  const inputPath = path.join(directory, `source.${extension === 'jpeg' ? 'jpg' : extension}`);

  try {
    await writeFile(inputPath, buffer, { flag: 'wx', mode: 0o600 });

    let pageCount = 1;
    let embeddedText = '';
    if (extension === 'pdf') {
      const info = await run('pdfinfo', [inputPath], PDF_INFO_TIMEOUT_MS);
      const pages = info.match(/^Pages:\s+(\d+)\s*$/m);
      pageCount = pages ? Number(pages[1]) : 0;
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new Error('This PDF could not be inspected safely. Please upload a valid PDF.');
      }
      if (pageCount > MAX_ACADEMIC_PDF_PAGES) {
        throw new Error(`This PDF has ${pageCount} pages. Sophis AI currently supports up to ${MAX_ACADEMIC_PDF_PAGES} pages per document.`);
      }
      embeddedText = extractAcademicDocumentText(buffer, filename).trim();
      if (embeddedText.length >= MIN_EMBEDDED_TEXT_LENGTH) {
        return embeddedText.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
      }
    }

    const remaining = () => MAX_OCR_PROCESSING_MS - (Date.now() - startedAt);
    const assertTimeRemaining = () => {
      if (remaining() <= 0) {
        throw new Error('Document OCR took too long. Please try a smaller or clearer document.');
      }
    };

    const recognized: string[] = [];
    if (extension === 'pdf') {
      for (let page = 1; page <= pageCount; page++) {
        assertTimeRemaining();
        const pagePrefix = path.join(directory, `page-${page}`);
        await run('pdftoppm', [
          '-f', String(page), '-l', String(page), '-r', '130',
          '-gray', '-jpeg', '-jpegopt', 'quality=75', '-singlefile',
          inputPath, pagePrefix,
        ], remaining());
        assertTimeRemaining();
        const pageImage = `${pagePrefix}.jpg`;
        const text = await run('tesseract', [
          pageImage, 'stdout', '-l', 'eng', '--psm', '3',
        ], remaining());
        if (text.trim()) recognized.push(text.trim());
        if (recognized.join('\n').length >= MAX_EXTRACTED_TEXT_LENGTH) break;
      }
    } else {
      assertTimeRemaining();
      const text = await run('tesseract', [inputPath, 'stdout', '-l', 'eng', '--psm', '3'], remaining());
      if (text.trim()) recognized.push(text.trim());
    }

    const ocrText = recognized.join('\n\n').slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    if (ocrText.replace(/\s/g, '').length < 20) {
      throw new Error('No readable text could be recognised. Please upload a clearer scan or a text-based document.');
    }
    return ocrText;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ENOENT')) {
      throw new Error('Scanned-document processing is temporarily unavailable. Please try again later.');
    }
    if (message.includes('timed out') || message.includes('ETIMEDOUT')) {
      throw new Error('Document OCR exceeded its processing-time limit. Please try a smaller or clearer document.');
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
