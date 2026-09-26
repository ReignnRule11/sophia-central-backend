export type UserRole = 'student' | 'lecturer' | 'moderator' | 'admin';
export type ResourceType =
  | 'lecture_notes'
  | 'past_question'
  | 'research_paper'
  | 'project'
  | 'slides'
  | 'other';

export type ModerationStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'flagged';

export type PointTransactionType = 'earned' | 'spent' | 'bonus';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  statusCode?: number;
  message?: string;
  timestamp?: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  institution?: string;
  faculty?: string;
  department?: string;
  isVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  user: User;
}

export interface Institution {
  id: string;
  name: string;
  country?: string;
  city?: string;
  faculties?: Faculty[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Faculty {
  id: string;
  name: string;
  institutionId?: string;
  departments?: Department[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  name: string;
  facultyId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Course {
  id: string;
  title: string;
  code?: string;
  description?: string;
  level?: string;
  institutionId?: string;
  institution?: Institution;
  topics?: CourseTopic[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CourseTopic {
  id: string;
  title: string;
  description?: string;
  courseId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Resource {
  id: string;
  title: string;
  description?: string;
  type: ResourceType;
  course?: string;
  topic?: string;
  institution?: string;
  level?: string;
  fileUrl?: string;
  moderationStatus: ModerationStatus;
  isVerified: boolean;
  views: number;
  downloads: number;
  uploaderId?: string;
  uploader?: Partial<User>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModerationReview {
  id: string;
  resourceId: string;
  reviewerId: string;
  status: ModerationStatus;
  note?: string;
  createdAt?: string;
}

export interface PointWallet {
  id: string;
  userId: string;
  balance: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PointTransaction {
  id: string;
  userId: string;
  type: PointTransactionType;
  amount: number;
  reason?: string;
  createdAt?: string;
}

export interface Referral {
  id: string;
  code: string;
  referrerId: string;
  referrer?: Partial<User>;
  referredUserId?: string;
  referredUser?: Partial<User>;
  isActive: boolean;
  redeemedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResourceSearchParams {
  q?: string;
  course?: string;
  institution?: string;
  level?: string;
  type?: ResourceType;
}

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  institution?: string;
  faculty?: string;
  department?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface CreateResourceDto {
  title: string;
  description?: string;
  type: ResourceType;
  course?: string;
  topic?: string;
  institution?: string;
  level?: string;
  fileUrl?: string;
}

export interface UpdateResourceDto {
  title?: string;
  description?: string;
  type?: ResourceType;
  course?: string;
  topic?: string;
  institution?: string;
  level?: string;
  fileUrl?: string;
  moderationStatus?: ModerationStatus;
}

export interface ReviewResourceDto {
  status: ModerationStatus;
  note?: string;
  reviewerId?: string;
}

export interface AwardPointsDto {
  userId: string;
  amount: number;
  reason?: string;
}

export interface PresignedUploadDto {
  fileName: string;
  fileSize: number;
  fileType: string;
  resourceId: string;
}

export interface UploadPresignedUrlResponse {
  presignedUrl: string;
  uploadId: string;
  fileName: string;
  resourceId: string;
  expiresIn: number;
  bucket?: string;
  key?: string;
}

export interface ConfirmUploadDto {
  uploadId: string;
  resourceId: string;
  fileName: string;
}

export interface AskAiDto {
  question: string;
  resourceId?: string;
}

export interface AiResponse {
  id: string;
  status: 'queued' | 'completed' | 'error';
  provider: 'openai' | 'anthropic';
  question: string;
  answer?: string;
  userId: string;
  resourceId?: string;
  tokensUsed?: number;
  createdAt: string;
}

export interface ReferralStats {
  totalReferrals: number;
  successfulReferrals: number;
  estimatedPointsEarned: number;
}

export interface AnalyticsOverview {
  totalResources: number;
  approvedResources: number;
  pendingResources: number;
  totalUsers: number;
  lecturers: number;
  admins: number;
  verificationRate: string;
}

export interface ResourceStatRow {
  type: ResourceType;
  count: number;
  avgViews: number;
  avgDownloads: number;
}

export interface UserStatRow {
  role: UserRole;
  count: number;
}

export const apiEndpoints = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    me: '/auth/me',
  },
  users: {
    list: '/users',
    me: '/users/me',
    update: (id: string) => `/users/${id}`,
    remove: (id: string) => `/users/${id}`,
  },
  institutions: {
    list: '/institutions',
    create: '/institutions',
    byId: (id: string) => `/institutions/${id}`,
  },
  courses: {
    list: '/courses',
    create: '/courses',
    byId: (id: string) => `/courses/${id}`,
  },
  resources: {
    list: '/resources',
    create: '/resources',
    byId: (id: string) => `/resources/${id}`,
  },
  search: '/search',
  moderation: {
    queue: '/moderation/queue',
    review: (resourceId: string) => `/moderation/resources/${resourceId}/review`,
  },
  points: {
    balance: (userId: string) => `/points/${userId}/balance`,
    transactions: (userId: string) => `/points/${userId}/transactions`,
    award: '/points/award',
  },
  referrals: {
    create: '/referrals/create',
    myCode: '/referrals/my-code',
    byCode: (code: string) => `/referrals/${code}`,
    redeem: '/referrals/redeem',
    stats: '/referrals/stats/overview',
  },
  storage: {
    presignedUrl: '/storage/presigned-url',
    confirmUpload: '/storage/confirm-upload',
  },
  ai: {
    ask: '/ai/ask',
  },
  analytics: {
    overview: '/analytics/overview',
    resources: '/analytics/resources',
    users: '/analytics/users',
    trending: '/analytics/trending',
  },
  seed: {
    run: '/seed/run',
  },
} as const;

export type ApiEndpointMap = typeof apiEndpoints;

export interface ApiClient {
  get<T>(url: string, params?: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<T>>;
  post<T>(url: string, body?: unknown): Promise<ApiResponse<T>>;
  patch<T>(url: string, body?: unknown): Promise<ApiResponse<T>>;
  delete<T>(url: string): Promise<ApiResponse<T>>;
}

export function buildQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) {
    return '';
  }

  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return query ? `?${query}` : '';
}

export const frontendApiContract = {
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000',
  endpoints: apiEndpoints,
  models: {
    User,
    Resource,
    Institution,
    Course,
    PointWallet,
    PointTransaction,
    Referral,
    AnalyticsOverview,
    AskAiDto,
  },
};

export default frontendApiContract;
