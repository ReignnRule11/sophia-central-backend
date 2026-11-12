import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    link?: string,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId,
      type,
      title,
      message,
      link,
      isRead: false,
    });

    return this.notificationRepository.save(notification);
  }

  async getUserNotifications(userId: string, limit: number = 20, unreadOnly: boolean = false) {
    // Private DM delivery is handled inside Messages, never in the notification centre.
    // Exclude legacy chat_message rows as well so old message previews are not exposed.
    const query = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.type != :excludedType', { excludedType: 'chat_message' });

    if (unreadOnly) {
      query.andWhere('notification.isRead = :isRead', { isRead: false });
    }

    const notifications = await query
      .orderBy('notification.createdAt', 'DESC')
      .take(limit)
      .getMany();

    const unreadCount = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.isRead = :isRead', { isRead: false })
      .andWhere('notification.type != :excludedType', { excludedType: 'chat_message' })
      .getCount();

    return {
      notifications,
      unreadCount,
    };
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({ where: { id, userId } });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );

    return { updated: result.affected || 0 };
  }
}
