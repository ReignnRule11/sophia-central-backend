import type {
  ApiClient,
  ApiResponse,
  LoginDto,
  CreateUserDto,
  CreateResourceDto,
  UpdateResourceDto,
  ReviewResourceDto,
  AwardPointsDto,
  AskAiDto,
  PresignedUploadDto,
  ConfirmUploadDto,
  ResourceSearchParams,
  User,
  Resource,
  AuthTokens,
  Institution,
  Course,
  PointWallet,
  PointTransaction,
  Referral,
  AnalyticsOverview,
  ResourceStatRow,
  UserStatRow,
  ModerateStatus,
  ModerationStatus,
  ApiEndpointMap,
} from './frontend-api-contract';

export type RequestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiClientConfig {
  baseUrl?: string;
  tokenStorageKey?: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  responseType?: 'json' | 'text';
  skipAuth?: boolean;
}

function isJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json');
}

export function buildApiClient(config: ApiClientConfig = {}): ApiClient & {
  setToken: (token: string | null) => void;
  getToken: () => string | null;
  request: <T>(method: RequestMethod, url: string, options?: RequestOptions) => Promise<ApiResponse<T>>;
  auth: {
    register: (payload: CreateUserDto) => Promise<ApiResponse<AuthTokens>>;
    login: (payload: LoginDto) => Promise<ApiResponse<AuthTokens>>;
    me: () => Promise<ApiResponse<User>>;
  };
  users: {
    list: () => Promise<ApiResponse<User[]>>;
    me: () => Promise<ApiResponse<User>>;
    update: (id: string, payload: Partial<User>) => Promise<ApiResponse<User>>;
    remove: (id: string) => Promise<ApiResponse<null>>;
  };
  resources: {
    list: (params?: ResourceSearchParams) => Promise<ApiResponse<Resource[]>>;
    create: (payload: CreateResourceDto) => Promise<ApiResponse<Resource>>;
    byId: (id: string) => Promise<ApiResponse<Resource>>;
    update: (id: string, payload: UpdateResourceDto) => Promise<ApiResponse<Resource>>;
    remove: (id: string) => Promise<ApiResponse<null>>;
  };
  institutions: {
    list: () => Promise<ApiResponse<Institution[]>>;
    create: (payload: Partial<Institution>) => Promise<ApiResponse<Institution>>;
    byId: (id: string) => Promise<ApiResponse<Institution>>;
  };
  courses: {
    list: () => Promise<ApiResponse<Course[]>>;
    create: (payload: Partial<Course>) => Promise<ApiResponse<Course>>;
    byId: (id: string) => Promise<ApiResponse<Course>>;
  };
  points: {
    balance: (userId: string) => Promise<ApiResponse<PointWallet>>;
    transactions: (userId: string) => Promise<ApiResponse<PointTransaction[]>>;
    award: (payload: AwardPointsDto) => Promise<ApiResponse<PointTransaction>>;
  };
  referrals: {
    create: (payload: { code?: string; referrerId?: string }) => Promise<ApiResponse<Referral>>;
    myCode: () => Promise<ApiResponse<{ code: string }>>;
    byCode: (code: string) => Promise<ApiResponse<Referral>>;
    redeem: (payload: { code: string; userId?: string }) => Promise<ApiResponse<Referral>>;
    stats: () => Promise<ApiResponse<{ totalReferrals: number; successfulReferrals: number; estimatedPointsEarned: number }>>;
  };
  storage: {
    presignedUrl: (payload: PresignedUploadDto) => Promise<ApiResponse<{ presignedUrl: string; uploadId: string; fileName: string; resourceId: string; expiresIn: number; bucket?: string; key?: string }>>;
    confirmUpload: (payload: ConfirmUploadDto) => Promise<ApiResponse<{ ok: boolean }>>;
  };
  ai: {
    ask: (payload: AskAiDto) => Promise<ApiResponse<{ answer?: string; id: string; status: string }>>;
  };
  analytics: {
    overview: () => Promise<ApiResponse<AnalyticsOverview>>;
    resources: () => Promise<ApiResponse<ResourceStatRow[]>>;
    users: () => Promise<ApiResponse<UserStatRow[]>>;
    trending: () => Promise<ApiResponse<Resource[]>>;
  };
} {
  const baseUrl = (config.baseUrl || 'http://localhost:3000').replace(/\/$/, '');
  const tokenStorageKey = config.tokenStorageKey || 'sophia_auth_token';
  const fetchImpl = config.fetchImpl || fetch;

  const getToken = () => {
    if (config.getToken) {
      return config.getToken();
    }

    if (typeof window !== 'undefined') {
      return window.localStorage.getItem(tokenStorageKey);
    }

    return null;
  };

  const setToken = (token: string | null) => {
    if (typeof window !== 'undefined') {
      if (token) {
        window.localStorage.setItem(tokenStorageKey, token);
      } else {
        window.localStorage.removeItem(tokenStorageKey);
      }
    }
  };

  const request = async <T>(method: RequestMethod, url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> => {
    const finalUrl = new URL(`${baseUrl}${url}`);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) {
          finalUrl.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      ...(options.headers || {}),
    };

    if (!headers['Content-Type'] && ['POST', 'PATCH'].includes(method) && options.body !== undefined && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const token = options.skipAuth ? null : getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchImpl(finalUrl.toString(), {
      method,
      headers,
      body:
        options.body === undefined || options.body === null || options.body instanceof FormData
          ? options.body instanceof FormData
            ? options.body
            : undefined
          : JSON.stringify(options.body),
    });

    if (response.status === 401 && config.onUnauthorized) {
      config.onUnauthorized();
    }

    if (!response.ok && response.status >= 400) {
      const payload = isJsonResponse(response)
        ? await response.json().catch(() => ({}))
        : await response.text().catch(() => '');

      throw {
        status: response.status,
        message: payload?.message || payload || 'Request failed',
        data: payload,
      };
    }

    if (options.responseType === 'text') {
      return (await response.text()) as unknown as ApiResponse<T>;
    }

    const payload = isJsonResponse(response) ? await response.json() : (await response.text()) as unknown as T;
    return payload as ApiResponse<T>;
  };

  const api: ApiClient & {
    setToken: (token: string | null) => void;
    getToken: () => string | null;
    request: <T>(method: RequestMethod, url: string, options?: RequestOptions) => Promise<ApiResponse<T>>;
  } = {
    get: <T>(url: string, params?: Record<string, string | number | boolean | undefined>) =>
      request<T>('GET', url, { params }),
    post: <T>(url: string, body?: unknown) => request<T>('POST', url, { body }),
    patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, { body }),
    delete: <T>(url: string) => request<T>('DELETE', url),
    setToken,
    getToken,
    request,
  };

  const auth = {
    register: (payload: CreateUserDto) => api.post<AuthTokens>('/auth/register', payload),
    login: async (payload: LoginDto) => {
      const result = await api.post<AuthTokens>('/auth/login', payload);
      if (result?.data?.accessToken) {
        setToken(result.data.accessToken);
      }
      return result;
    },
    me: () => api.get<User>('/auth/me'),
  };

  const users = {
    list: () => api.get<User[]>('/users'),
    me: () => api.get<User>('/users/me'),
    update: (id: string, payload: Partial<User>) => api.patch<User>(`/users/${id}`, payload),
    remove: (id: string) => api.delete<null>(`/users/${id}`),
  };

  const institutions = {
    list: () => api.get<Institution[]>('/institutions'),
    create: (payload: Partial<Institution>) => api.post<Institution>('/institutions', payload),
    byId: (id: string) => api.get<Institution>(`/institutions/${id}`),
  };

  const courses = {
    list: () => api.get<Course[]>('/courses'),
    create: (payload: Partial<Course>) => api.post<Course>('/courses', payload),
    byId: (id: string) => api.get<Course>(`/courses/${id}`),
  };

  const resources = {
    list: (params?: ResourceSearchParams) => api.get<Resource[]>('/resources', params),
    create: (payload: CreateResourceDto) => api.post<Resource>('/resources', payload),
    byId: (id: string) => api.get<Resource>(`/resources/${id}`),
    update: (id: string, payload: UpdateResourceDto) => api.patch<Resource>(`/resources/${id}`, payload),
    remove: (id: string) => api.delete<null>(`/resources/${id}`),
  };

  const points = {
    balance: (userId: string) => api.get<PointWallet>(`/points/${userId}/balance`),
    transactions: (userId: string) => api.get<PointTransaction[]>(`/points/${userId}/transactions`),
    award: (payload: AwardPointsDto) => api.post<PointTransaction>('/points/award', payload),
  };

  const referrals = {
    create: (payload: { code?: string; referrerId?: string }) => api.post<Referral>('/referrals/create', payload),
    myCode: () => api.get<{ code: string }>('/referrals/my-code'),
    byCode: (code: string) => api.get<Referral>(`/referrals/${code}`),
    redeem: (payload: { code: string; userId?: string }) => api.post<Referral>('/referrals/redeem', payload),
    stats: () => api.get<{ totalReferrals: number; successfulReferrals: number; estimatedPointsEarned: number }>('/referrals/stats/overview'),
  };

  const storage = {
    presignedUrl: (payload: PresignedUploadDto) => api.post<{ presignedUrl: string; uploadId: string; fileName: string; resourceId: string; expiresIn: number; bucket?: string; key?: string }>('/storage/presigned-url', payload),
    confirmUpload: (payload: ConfirmUploadDto) => api.post<{ ok: boolean }>('/storage/confirm-upload', payload),
  };

  const ai = {
    ask: (payload: AskAiDto) => api.post<{ answer?: string; id: string; status: string }>('/ai/ask', payload),
  };

  const analytics = {
    overview: () => api.get<AnalyticsOverview>('/analytics/overview'),
    resources: () => api.get<ResourceStatRow[]>('/analytics/resources'),
    users: () => api.get<UserStatRow[]>('/analytics/users'),
    trending: () => api.get<Resource[]>('/analytics/trending'),
  };

  return {
    ...api,
    auth,
    users,
    institutions,
    courses,
    resources,
    points,
    referrals,
    storage,
    ai,
    analytics,
    setToken,
    getToken,
    request,
  };
}

export const frontendApiClient = buildApiClient();

export default frontendApiClient;

export const exampleUsage = `
  import frontendApiClient from './frontend-api-client';

  const { auth, resources, storage } = frontendApiClient;

  await auth.login({ email: 'student@university.edu', password: 'secret123' });

  const resourcesResult = await resources.list({ q: 'machine learning', type: 'research_paper' });

  const upload = await storage.presignedUrl({
    fileName: 'notes.pdf',
    fileSize: 250000,
    fileType: 'application/pdf',
    resourceId: 'resource-123',
  });
`;
