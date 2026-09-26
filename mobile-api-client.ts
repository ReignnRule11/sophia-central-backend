import type {
  ApiResponse,
  AskAiDto,
  AuthTokens,
  Course,
  CreateResourceDto,
  CreateUserDto,
  Institution,
  LoginDto,
  PointTransaction,
  PointWallet,
  PresignedUploadDto,
  Referral,
  Resource,
  ResourceSearchParams,
  User,
} from './frontend-api-contract';

export interface MobileTokenStore {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export interface MobileApiClientConfig {
  baseUrl: string;
  tokenStore: MobileTokenStore;
  tokenStorageKey?: string;
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void | Promise<void>;
}

export interface MobileRequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export interface MobileApiError {
  status: number;
  message: string;
  data?: unknown;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

function encodeParams(params?: MobileRequestOptions['params']): string {
  if (!params) return '';

  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return query ? `?${query}` : '';
}

async function readResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  return response.text().catch(() => '');
}

/**
 * React Native-compatible client. It intentionally does not import AsyncStorage;
 * pass an AsyncStorage adapter from the mobile application to avoid coupling the
 * shared client to a specific storage library.
 */
export function createMobileApiClient(config: MobileApiClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const tokenKey = config.tokenStorageKey || 'sophia_auth_token';
  const fetchImpl = config.fetchImpl || fetch;

  async function getToken(): Promise<string | null> {
    return config.tokenStore.getItem(tokenKey);
  }

  async function setToken(token: string | null): Promise<void> {
    if (token) {
      await config.tokenStore.setItem(tokenKey, token);
    } else {
      await config.tokenStore.removeItem(tokenKey);
    }
  }

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: MobileRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = options.skipAuth ? null : await getToken();
    const headers: Record<string, string> = {
      ...(options.body !== undefined ? jsonHeaders : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const response = await fetchImpl(`${baseUrl}${path}${encodeParams(options.params)}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const data = await readResponse(response);

    if (response.status === 401) {
      await setToken(null);
      await config.onUnauthorized?.();
    }

    if (!response.ok) {
      const payload = data as { message?: string } | string | null;
      const error: MobileApiError = {
        status: response.status,
        message:
          typeof payload === 'string'
            ? payload
            : payload?.message || 'The request could not be completed.',
        data,
      };
      throw error;
    }

    return data as ApiResponse<T>;
  }

  async function uploadFile(
    upload: PresignedUploadDto,
    fileUri: string,
    fileType = upload.fileType,
  ): Promise<ApiResponse<{ fileUrl?: string; uploadId: string }>> {
    const presigned = await request<{
      presignedUrl: string;
      uploadId: string;
      fileName: string;
      resourceId: string;
      expiresIn: number;
      key?: string;
    }>('POST', '/storage/presigned-url', { body: upload });

    // React Native's global fetch accepts a local file URI as the request body.
    // The presigned URL is returned by the backend and never exposed as an API key.
    const uploadResponse = await fetchImpl(presigned.data.presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: { uri: fileUri, type: fileType, name: upload.fileName } as unknown as BodyInit,
    });

    if (!uploadResponse.ok) {
      throw {
        status: uploadResponse.status,
        message: 'File upload failed.',
      } satisfies MobileApiError;
    }

    return request<{ fileUrl?: string; uploadId: string }>('POST', '/storage/confirm-upload', {
      body: {
        uploadId: presigned.data.uploadId,
        resourceId: upload.resourceId,
        fileName: upload.fileName,
      },
    });
  }

  const client = {
    request,
    getToken,
    setToken,
    uploadFile,

    auth: {
      register: (payload: CreateUserDto) => request<AuthTokens>('POST', '/auth/register', { body: payload }),
      login: async (payload: LoginDto) => {
        const result = await request<AuthTokens>('POST', '/auth/login', { body: payload });
        if (result.data?.accessToken) await setToken(result.data.accessToken);
        return result;
      },
      logout: () => setToken(null),
      me: () => request<User>('GET', '/auth/me'),
    },

    resources: {
      list: (params?: ResourceSearchParams) => request<Resource[]>('GET', '/search', { params }),
      create: (payload: CreateResourceDto) => request<Resource>('POST', '/resources', { body: payload }),
      byId: (id: string) => request<Resource>('GET', `/resources/${id}`),
      update: (id: string, payload: Partial<CreateResourceDto>) =>
        request<Resource>('PATCH', `/resources/${id}`, { body: payload }),
      remove: (id: string) => request<null>('DELETE', `/resources/${id}`),
    },

    institutions: {
      list: () => request<Institution[]>('GET', '/institutions'),
      byId: (id: string) => request<Institution>('GET', `/institutions/${id}`),
    },

    courses: {
      list: (institutionId?: string) => request<Course[]>('GET', '/courses', { params: { institutionId } }),
      byId: (id: string) => request<Course>('GET', `/courses/${id}`),
    },

    points: {
      balance: (userId: string) => request<PointWallet>('GET', `/points/${userId}/balance`),
      transactions: (userId: string, limit = 20) =>
        request<PointTransaction[]>('GET', `/points/${userId}/transactions`, { params: { limit } }),
    },

    referrals: {
      create: () => request<Referral>('POST', '/referrals/create'),
      myCode: () => request<Referral>('GET', '/referrals/my-code'),
      redeem: (code: string) => request<{ success: boolean; pointsAwarded: number }>('POST', '/referrals/redeem', { body: { code } }),
      stats: () => request<{ totalReferrals: number; successfulReferrals: number; estimatedPointsEarned: number }>('GET', '/referrals/stats/overview'),
    },

    ai: {
      ask: (payload: AskAiDto) => request<{ id: string; status: string; answer?: string }>('POST', '/ai/ask', { body: payload }),
    },
  };

  return client;
}

export type MobileApiClient = ReturnType<typeof createMobileApiClient>;

/*
Example React Native setup with @react-native-async-storage/async-storage:

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMobileApiClient } from './mobile-api-client';

export const api = createMobileApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000',
  tokenStore: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  },
  onUnauthorized: () => navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] }),
});

const result = await api.resources.list({ q: 'biology', level: '200' });
*/
