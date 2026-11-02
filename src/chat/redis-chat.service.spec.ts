import { firstValueFrom, timeout } from 'rxjs';
import { RedisChatService } from './redis-chat.service';

const redisConfigured = Boolean(process.env.REDIS_URL);

(redisConfigured ? describe : describe.skip)('RedisChatService integration', () => {
  let publisher: RedisChatService;
  let receiver: RedisChatService;

  beforeAll(async () => {
    publisher = new RedisChatService();
    receiver = new RedisChatService();
    await Promise.all([publisher.onModuleInit(), receiver.onModuleInit()]);
  });

  afterAll(async () => {
    await Promise.all([publisher?.onModuleDestroy(), receiver?.onModuleDestroy()]);
  });

  it('shares presence keys between independent backend instances', async () => {
    const userId = `redis-test-${Date.now()}`;
    await publisher.setPresence(userId);
    await expect(receiver.isOnline(userId)).resolves.toBe(true);
  });

  it('fans room events out to subscribers on another backend instance', async () => {
    const roomKey = `group:redis-integration-${Date.now()}`;
    const event = firstValueFrom(receiver.events$.pipe(timeout(2000)));
    await publisher.publishRoom(roomKey);
    await expect(event).resolves.toEqual({ roomKey });
  });
});
