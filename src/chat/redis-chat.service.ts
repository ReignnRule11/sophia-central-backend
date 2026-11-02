import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { Observable, Subject } from 'rxjs';

type ChatRoomEvent = { roomKey: string };

@Injectable()
export class RedisChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisChatService.name);
  private publisher?: RedisClientType;
  private subscriber?: RedisClientType;
  private readonly roomEvents = new Subject<ChatRoomEvent>();
  readonly events$: Observable<ChatRoomEvent> = this.roomEvents.asObservable();
  private readonly presenceTtlSeconds = 60;

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_URL is required in production for shared chat presence and events.');
      }
      this.logger.warn('REDIS_URL is not configured; shared chat presence/events are unavailable outside production.');
      return;
    }

    this.publisher = createClient({ url });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', error => this.logger.error('Redis publisher error', error));
    this.subscriber.on('error', error => this.logger.error('Redis subscriber error', error));
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe('sophis:chat:rooms', payload => {
      try {
        const event = JSON.parse(payload) as ChatRoomEvent;
        if (event && typeof event.roomKey === 'string') this.roomEvents.next(event);
      } catch {
        this.logger.warn('Ignored malformed Redis chat event.');
      }
    });
    this.logger.log('Redis chat presence and Pub/Sub connected.');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.publisher?.isOpen ? this.publisher.quit() : Promise.resolve(),
      this.subscriber?.isOpen ? this.subscriber.quit() : Promise.resolve(),
    ]);
    this.roomEvents.complete();
  }

  async setPresence(userId: string): Promise<void> {
    if (!this.publisher?.isReady) {
      if (process.env.NODE_ENV === 'production') throw new Error('Redis is unavailable for chat presence.');
      return;
    }
    await this.publisher.set(this.presenceKey(userId), '1', { EX: this.presenceTtlSeconds });
  }

  async isOnline(userId: string): Promise<boolean> {
    if (!this.publisher?.isReady) return false;
    return (await this.publisher.exists(this.presenceKey(userId))) === 1;
  }

  async publishRoom(roomKey: string): Promise<void> {
    if (!this.publisher?.isReady) {
      if (process.env.NODE_ENV === 'production') throw new Error('Redis is unavailable for chat events.');
      return;
    }
    await this.publisher.publish('sophis:chat:rooms', JSON.stringify({ roomKey }));
  }

  private presenceKey(userId: string): string {
    return `sophis:chat:presence:${userId}`;
  }
}
