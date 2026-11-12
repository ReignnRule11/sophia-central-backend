import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const listQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => []),
  };
  const countQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn(async () => 3),
  };
  const repository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(value => value),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.createQueryBuilder
      .mockReturnValueOnce(listQuery)
      .mockReturnValueOnce(countQuery);
    service = new NotificationsService(repository as any);
  });

  it('excludes private message previews and counts from the notification centre', async () => {
    await expect(service.getUserNotifications('student-1', 100, false)).resolves.toEqual({
      notifications: [],
      unreadCount: 3,
    });

    expect(listQuery.andWhere).toHaveBeenCalledWith(
      'notification.type != :excludedType',
      { excludedType: 'chat_message' },
    );
    expect(countQuery.andWhere).toHaveBeenCalledWith(
      'notification.type != :excludedType',
      { excludedType: 'chat_message' },
    );
  });

  it('continues to apply unread-only filtering to important notifications', async () => {
    await service.getUserNotifications('lecturer-1', 20, true);

    expect(listQuery.andWhere).toHaveBeenCalledWith(
      'notification.isRead = :isRead',
      { isRead: false },
    );
    expect(listQuery.andWhere).toHaveBeenCalledWith(
      'notification.type != :excludedType',
      { excludedType: 'chat_message' },
    );
  });
});
