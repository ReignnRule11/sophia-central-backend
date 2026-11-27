import { AiService } from './ai.service';
import { Readable } from 'node:stream';
import { ResourceModerationStatus } from '../resources/entities/resource.entity';

describe('AiService Wisdom Points pricing', () => {
  let service: AiService;
  let sessions: any;
  let messages: any;
  let resources: any;
  let points: any;
  let provider: any;
  let savedResources: any;
  let fileUploads: any;
  let storage: any;

  beforeEach(() => {
    sessions = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(value => value),
      save: jest.fn(async value => ({ id: 'session-1', ...value })),
    };
    messages = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn(value => value),
      save: jest.fn(async value => ({ id: 'message-1', ...value })),
    };
    resources = {
      findOne: jest.fn().mockResolvedValue({
        id: 'resource-1',
        title: 'Biology notes',
        description: 'Cell structure',
        type: 'lecture_note',
        moderationStatus: ResourceModerationStatus.APPROVED,
        isVerified: true,
      }),
    };
    points = {
      getBalance: jest.fn().mockResolvedValue(20),
      chargeForAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    provider = { generateText: jest.fn().mockResolvedValue('Generated academic answer') };
    savedResources = { findOne: jest.fn().mockResolvedValue({ downloadedAt: new Date() }) };
    fileUploads = { findOne: jest.fn().mockResolvedValue(null) };
    storage = {
      getKeyFromPublicUrl: jest.fn().mockReturnValue('resources/00000000-0000-0000-0000-000000000001/biology.txt'),
      getObjectStream: jest.fn().mockResolvedValue({ body: Readable.from(['Cell membranes regulate transport across the cell.']), contentLength: 53 }),
    };
    resources.findOne.mockImplementation(async () => ({
      id: 'resource-1', title: 'Biology notes', description: 'Cell structure', type: 'lecture_note',
      fileUrl: 'https://files.example/resources/biology.txt',
      moderationStatus: ResourceModerationStatus.APPROVED, isVerified: true,
    }));
    service = new AiService(sessions, messages, resources, points, provider, savedResources, fileUploads, storage);
  });

  it('clears a previously selected resource and charges 1 WP for a general follow-up', async () => {
    const existingSession = { id: 'session-1', userId: 'student-1', resourceId: 'resource-1' };
    sessions.findOne.mockResolvedValue(existingSession);
    resources.findOne.mockResolvedValue(null);

    const result = await service.processQuestion('student-1', {
      question: 'Now explain this generally',
      sessionId: 'session-1',
      resourceId: null,
    } as any);

    expect(existingSession.resourceId).toBeNull();
    expect(sessions.save).toHaveBeenCalledWith(existingSession);
    expect(points.chargeForAiUsage).toHaveBeenCalledWith(
      'student-1',
      1,
      'AI tutor query - resource: general',
    );
    expect(result.pointsUsed).toBe(1);
  });

  it('charges 1 WP for a successful question without a resource', async () => {
    resources.findOne.mockResolvedValue(null);

    const result = await service.processQuestion('student-1', { question: 'Explain cells' } as any);

    expect(points.chargeForAiUsage).toHaveBeenCalledWith(
      'student-1',
      1,
      'AI tutor query - resource: general',
    );
    expect(result.pointsUsed).toBe(1);
    expect(result.balanceRemaining).toBe(19);
  });

  it('charges 2 WP for a successful question using an approved resource', async () => {
    const result = await service.processQuestion('student-1', {
      question: 'Explain this material',
      resourceId: 'resource-1',
    } as any);

    expect(resources.findOne).toHaveBeenCalledWith({
      where: [
        { id: 'resource-1', isVerified: true },
        { id: 'resource-1', moderationStatus: ResourceModerationStatus.APPROVED },
      ],
    });
    expect(provider.generateText).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Cell membranes regulate transport'), expect.any(Array));
    expect(storage.getObjectStream).toHaveBeenCalled();
    expect(points.chargeForAiUsage).toHaveBeenCalledWith(
      'student-1',
      2,
      'AI tutor query - resource: resource-1',
    );
    expect(result.pointsUsed).toBe(2);
    expect(result.balanceRemaining).toBe(18);
  });

  it('charges 5 WP for a successful resource summary', async () => {
    const result = await service.summarizeResource('student-1', { resourceId: 'resource-1' } as any);

    expect(points.chargeForAiUsage).toHaveBeenCalledWith(
      'student-1',
      5,
      'Resource summary - Biology notes',
    );
    expect(result.pointsUsed).toBe(5);
    expect(result.balanceRemaining).toBe(15);
  });

  it('does not charge points when AI generation fails', async () => {
    resources.findOne.mockResolvedValue(null);
    provider.generateText.mockRejectedValue(new Error('Provider unavailable'));

    await expect(service.processQuestion('student-1', { question: 'Explain cells' } as any))
      .rejects.toThrow('Provider unavailable');
    expect(points.chargeForAiUsage).not.toHaveBeenCalled();
    expect(messages.save).not.toHaveBeenCalled();
  });
});
