import { createServer, Server } from 'node:net';
import { ClamAvService } from './clamav.service';

describe('ClamAvService fail-closed scanning', () => {
  let server: Server | undefined;
  let hostBefore: string | undefined;
  let portBefore: string | undefined;

  beforeEach(() => {
    hostBefore = process.env.CLAMAV_HOST;
    portBefore = process.env.CLAMAV_PORT;
  });

  afterEach(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (hostBefore === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = hostBefore;
    if (portBefore === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = portBefore;
    server = undefined;
  });

  async function startFake(response: string): Promise<void> {
    server = createServer(socket => {
      socket.on('data', () => undefined);
      socket.on('end', () => socket.end(response));
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server!.address();
    if (!address || typeof address === 'string') throw new Error('Fake ClamAV server did not bind.');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(address.port);
  }

  it('accepts a clean scanner response', async () => {
    await startFake('stream: OK\\0');
    await expect(new ClamAvService().scan(Buffer.from('clean test'))).resolves.toEqual({
      clean: true,
      result: 'stream: OK',
    });
  });

  it('rejects a malware-positive scanner response', async () => {
    await startFake('stream: Eicar-Test-Signature FOUND\\0');
    await expect(new ClamAvService().scan(Buffer.from('infected test'))).resolves.toMatchObject({ clean: false });
  });

  it('fails closed when no scanner endpoint is configured', async () => {
    delete process.env.CLAMAV_HOST;
    await expect(new ClamAvService().scan(Buffer.from('test'))).rejects.toThrow('Malware scanning is not configured');
  });
});
