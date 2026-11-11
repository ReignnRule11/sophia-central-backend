import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createConnection } from 'node:net';

export interface MalwareScanResult {
  clean: boolean;
  result: string;
}

@Injectable()
export class ClamAvService {
  async scan(buffer: Buffer): Promise<MalwareScanResult> {
    if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
      throw new ServiceUnavailableException('Malware scanning could not read this upload.');
    }
    const host = process.env.CLAMAV_HOST?.trim();
    const port = Number(process.env.CLAMAV_PORT || 3310);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('Malware scanning is not configured; uploads are temporarily unavailable.');
    }

    let response: string;
    try {
      response = await new Promise<string>((resolve, reject) => {
        const socket = createConnection({ host, port });
        let output = '';
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else resolve(output.trim());
        };
        socket.setTimeout(90_000);
        socket.once('connect', () => {
          socket.write(Buffer.from('zINSTREAM\\0', 'ascii'));
          const chunkSize = 64 * 1024;
          for (let offset = 0; offset < buffer.length; offset += chunkSize) {
            const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
            const length = Buffer.alloc(4);
            length.writeUInt32BE(chunk.length, 0);
            socket.write(length);
            socket.write(chunk);
          }
          socket.end(Buffer.alloc(4));
        });
        socket.on('data', chunk => {
          output += chunk.toString('utf8');
          if (output.length > 4096) socket.destroy(new Error('ClamAV response exceeded the expected size.'));
        });
        socket.once('end', () => finish());
        socket.once('timeout', () => socket.destroy(new Error('ClamAV scan timed out.')));
        socket.once('error', error => finish(error));
        socket.once('close', hadError => {
          if (hadError) finish(new Error('ClamAV connection closed unexpectedly.'));
        });
      });
    } catch {
      throw new ServiceUnavailableException('Malware scanning is temporarily unavailable; the upload was not accepted.');
    }

    if (/\\bFOUND\\b/i.test(response)) return { clean: false, result: response.slice(0, 500) };
    if (/\\bOK\\b/i.test(response) && !/\\bERROR\\b/i.test(response)) {
      return { clean: true, result: response.slice(0, 500) };
    }
    throw new ServiceUnavailableException('Malware scanning could not verify this upload; please retry later.');
  }
}
