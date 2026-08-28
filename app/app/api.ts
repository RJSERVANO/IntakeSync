import {
  abortAllPendingRequests,
  createTrackedAbortController,
  getCurrentAuthSessionVersion,
  isAuthSessionContextCurrent,
  releaseTrackedAbortController,
} from '../services/authSession';
import NetInfo from '@react-native-community/netinfo';
import { DeviceEventEmitter } from 'react-native';
import { logPerf, perfNow } from '../utils/perf';

export const AUTH_FAILURE_EVENT = 'intakesync.auth.failure';

function notifyAuthenticatedRequestFailure(status: number | undefined, token?: string) {
  if (status === 401 && token) {
    DeviceEventEmitter.emit(AUTH_FAILURE_EVENT, { token });
  }
}

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const BASE_URL = configuredBaseUrl ? configuredBaseUrl.replace(/\/+$/, '') : '';
const API_DEBUG = __DEV__ || process.env.EXPO_PUBLIC_API_DEBUG === 'true';

if (API_DEBUG) {
  if (BASE_URL) {
    console.log('API BASE_URL:', BASE_URL);
  } else {
    console.warn('EXPO_PUBLIC_API_URL is not configured.');
  }
}

const ngrokHeaders =
  BASE_URL.includes('ngrok-free.app') || BASE_URL.includes('ngrok-free.dev') || BASE_URL.includes('ngrok.app')
    ? { 'ngrok-skip-browser-warning': 'true' }
    : {};

export type ApiErrorType = 'auth' | 'network' | 'timeout' | 'validation' | 'not_found' | 'server' | 'unknown';

export interface ApiError {
  status?: number;
  data?: any;
  type: ApiErrorType;
  message: string;
  method?: string;
  url?: string;
  isNetworkError?: boolean;
  isAuthError?: boolean;
  isValidationError?: boolean;
  isStaleSessionError?: boolean;
  requestSessionVersion?: string;
  responseFormat?: 'json' | 'html' | 'text' | 'empty';
}

type BackendReachabilityState = {
  reachable: boolean | null;
  checkedAt: number;
  checking: boolean;
  lastError?: string | null;
};

const BACKEND_REACHABILITY_TTL_MS = 20 * 1000;
const BACKEND_UNAVAILABLE_COOLDOWN_MS = 25 * 1000;
const RECONNECT_GRACE_MS = 1500;
const backendReachabilityState: BackendReachabilityState = {
  reachable: null,
  checkedAt: 0,
  checking: false,
  lastError: null,
};
const backendReachabilityListeners = new Set<(state: BackendReachabilityState) => void>();
let backendReachabilityPromise: Promise<boolean> | null = null;

type GetCacheEntry = {
  data: any;
  expiresAt: number;
};

type GetInFlightRequest = {
  promise: Promise<any>;
  group: string;
  groupVersionKey: string;
  groupVersion: number;
  requestToken: symbol;
  controller?: AbortController;
};

const getInFlightRequests = new Map<string, GetInFlightRequest>();
const getTtlCache = new Map<string, GetCacheEntry>();
const getCacheGroupVersions = new Map<string, number>();

const GET_TTL_RULES: { pattern: RegExp; ttlMs: number; group: string }[] = [
  { pattern: /^\/me(?:\?|$)/, ttlMs: 45 * 1000, group: 'profile' },
  { pattern: /^\/notifications\/today-timeline(?:\?|$)/, ttlMs: 20 * 1000, group: 'notifications' },
  { pattern: /^\/notifications(?:\?|$)/, ttlMs: 20 * 1000, group: 'notifications' },
  { pattern: /^\/notifications\/stats(?:\?|$)/, ttlMs: 20 * 1000, group: 'notifications' },
  { pattern: /^\/medications\/upcoming(?:\?|$)/, ttlMs: 20 * 1000, group: 'medications' },
  { pattern: /^\/medications\/stats(?:\?|$)/, ttlMs: 20 * 1000, group: 'medications' },
  { pattern: /^\/medications\/history\/all(?:\?|$)/, ttlMs: 45 * 1000, group: 'medication-history' },
  { pattern: /^\/medications(?:\?|$)/, ttlMs: 20 * 1000, group: 'medications' },
  { pattern: /^\/hydration(?:\?|$)/, ttlMs: 20 * 1000, group: 'hydration' },
];

export function getBackendReachabilitySnapshot(): BackendReachabilityState {
  return { ...backendReachabilityState };
}

function emitBackendReachability() {
  const snapshot = getBackendReachabilitySnapshot();
  backendReachabilityListeners.forEach((listener) => listener(snapshot));
}

export function subscribeBackendReachability(listener: (state: BackendReachabilityState) => void) {
  backendReachabilityListeners.add(listener);
  listener(getBackendReachabilitySnapshot());
  return () => backendReachabilityListeners.delete(listener);
}

function setBackendReachability(reachable: boolean | null, lastError?: string | null) {
  backendReachabilityState.reachable = reachable;
  backendReachabilityState.checkedAt = Date.now();
  backendReachabilityState.lastError = lastError ?? null;
  emitBackendReachability();
}

function normalizePathForKey(path: string) {
  try {
    const url = new URL(path, 'https://intakesync.local');
    const params = Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const query = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    return `${url.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return path || '/';
  }
}

function authCacheScope(token?: string, requestSessionVersion?: string) {
  if (!token) return 'anonymous';
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
  }
  return `${requestSessionVersion || 'session'}:${Math.abs(hash)}`;
}

function getTtlRule(path: string) {
  const normalized = normalizePathForKey(path);
  return GET_TTL_RULES.find((rule) => rule.pattern.test(normalized));
}

function getRequestCacheKey(method: string, path: string, token?: string, requestSessionVersion?: string) {
  return `${method}:${authCacheScope(token, requestSessionVersion)}:${normalizePathForKey(path)}`;
}

function getGroupVersionKey(group: string, token?: string, requestSessionVersion?: string) {
  return `${authCacheScope(token, requestSessionVersion)}:${group}`;
}

function getCacheGroupVersion(group: string, token?: string, requestSessionVersion?: string) {
  return getCacheGroupVersions.get(getGroupVersionKey(group, token, requestSessionVersion)) || 0;
}

function bumpCacheGroupVersion(group: string, token?: string, requestSessionVersion?: string) {
  const key = getGroupVersionKey(group, token, requestSessionVersion);
  const next = (getCacheGroupVersions.get(key) || 0) + 1;
  getCacheGroupVersions.set(key, next);
  return next;
}

function isBackendCooldownActive(path: string) {
  if (path === '/ping') return false;
  if (backendReachabilityState.reachable !== false) return false;
  return Date.now() - backendReachabilityState.checkedAt < BACKEND_UNAVAILABLE_COOLDOWN_MS;
}

function makeBackendCooldownError(method: string, url: string, requestSessionVersion?: string): ApiError {
  return attachRequest({
    status: 0,
    data: { message: backendReachabilityState.lastError || 'Backend unavailable.' },
    type: 'network',
    message: backendReachabilityState.lastError || 'Backend unavailable.',
    isNetworkError: true,
    isAuthError: false,
    isValidationError: false,
    requestSessionVersion,
  }, method, url);
}

function invalidateCachedGetKey(cacheKey: string) {
  getTtlCache.delete(cacheKey);
  const inFlight = getInFlightRequests.get(cacheKey);
  inFlight?.controller?.abort();
  getInFlightRequests.delete(cacheKey);
}

export function invalidateApiCacheForPath(path: string, token?: string) {
  const normalized = normalizePathForKey(path);
  const scopePrefix = token ? `GET:${authCacheScope(token, getCurrentAuthSessionVersion())}:` : 'GET:';
  Array.from(getTtlCache.keys()).forEach((key) => {
    if (key.startsWith(scopePrefix) && key.includes(normalized)) invalidateCachedGetKey(key);
  });
}

export function invalidateApiCacheGroup(group: 'profile' | 'notifications' | 'medications' | 'medication-history' | 'hydration', token?: string) {
  bumpCacheGroupVersion(group, token, getCurrentAuthSessionVersion());
  const scopePrefix = token ? `GET:${authCacheScope(token, getCurrentAuthSessionVersion())}:` : 'GET:';
  Array.from(getTtlCache.keys()).forEach((key) => {
    if (!key.startsWith(scopePrefix)) return;
    const path = key.split(':').slice(3).join(':');
    const rule = getTtlRule(path);
    if (rule?.group === group) invalidateCachedGetKey(key);
  });
  Array.from(getInFlightRequests.entries()).forEach(([key, request]) => {
    if (!key.startsWith(scopePrefix)) return;
    if (request.group === group) invalidateCachedGetKey(key);
  });
}

function invalidateApiCacheAfterMutation(path: string, token?: string) {
  const normalized = normalizePathForKey(path);
  if (normalized.startsWith('/hydration')) {
    invalidateApiCacheGroup('hydration', token);
    return;
  }
  if (normalized.startsWith('/medications')) {
    invalidateApiCacheGroup('medications', token);
    invalidateApiCacheGroup('medication-history', token);
    return;
  }
  if (normalized.startsWith('/notifications')) {
    invalidateApiCacheGroup('notifications', token);
    return;
  }
  if (normalized.startsWith('/me') || normalized.includes('/profile') || normalized.includes('/user')) {
    invalidateApiCacheGroup('profile', token);
  }
}

function validationMessage(data: any) {
  if (!data?.errors || typeof data.errors !== 'object') {
    return undefined;
  }

  const messages = Object.entries(data.errors)
    .flatMap(([field, value]) => {
      const fieldLabel = field.replace(/_/g, ' ');
      const values = Array.isArray(value) ? value : [value];
      return values
        .filter(Boolean)
        .map((message) => `${fieldLabel}: ${String(message)}`);
    });

  return messages.length ? messages.join('\n') : undefined;
}

function makeApiError(status: number | undefined, data: any, fallbackMessage: string): ApiError {
  const message =
    validationMessage(data) ||
    data?.message ||
    (typeof data === 'string' ? data : undefined) ||
    fallbackMessage;
  const type: ApiErrorType =
    status === 401 ? 'auth' :
    status === 422 ? 'validation' :
    status === 404 ? 'not_found' :
    status && status >= 500 ? 'server' :
    status ? 'unknown' :
    'network';

  return {
    status,
    data,
    type,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    isNetworkError: type === 'network',
    isAuthError: type === 'auth',
    isValidationError: type === 'validation',
    responseFormat: data?.response_format,
  };
}

function makeBackendUnavailableError(status: number | undefined, data: any, fallbackMessage = 'Backend unavailable.'): ApiError {
  return {
    ...makeApiError(status, data, fallbackMessage),
    type: 'network',
    message: data?.message || fallbackMessage,
    isNetworkError: true,
    responseFormat: data?.response_format,
  };
}

function successfulBackendResponse(data: any) {
  return !data?.response_format || data.response_format === 'json';
}

function noteSuccessfulBackendResponse(data: any) {
  if (successfulBackendResponse(data)) setBackendReachability(true);
}

export function isBackendReachabilityError(error: any) {
  const status = Number(error?.status || 0);
  const responseFormat = error?.responseFormat || error?.data?.response_format;
  if (responseFormat === 'html' || responseFormat === 'text') return true;
  if (error?.type === 'timeout' || status === 408) return true;
  if (error?.type === 'network' || status === 0) return true;
  if ([500, 502, 503, 504].includes(status)) return true;
  return false;
}

function noteFailedBackendResponse(error: any) {
  if (isBackendReachabilityError(error)) {
    setBackendReachability(false, error?.message || error?.data?.message || 'Backend unavailable.');
  }
}

function safeEndpointFromPath(path: string) {
  const [route, query = ''] = path.split('?');
  const safeRoute = (route || '/')
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[0-9a-f]{8,}(-[0-9a-f]{4,}){2,}$/i.test(segment)) return ':id';
      if (/^(bev_|med_|medhist_|queue_|server_|local_)/.test(segment)) return ':id';
      return segment;
    })
    .join('/');
  if (!query) return safeRoute;
  const queryKeys = query
    .split('&')
    .map((part) => part.split('=')[0])
    .filter(Boolean)
    .sort();
  return queryKeys.length ? `${safeRoute}?${queryKeys.map((key) => `${key}=<redacted>`).join('&')}` : safeRoute;
}

function safeEndpointFromUrl(url: string) {
  const withoutBase = BASE_URL && url.startsWith(BASE_URL) ? url.slice(BASE_URL.length) || '/' : url;
  return safeEndpointFromPath(withoutBase);
}

function responseFormatFor(data: any): 'json' | 'html' | 'text' | 'empty' {
  if (data === null || data === undefined) return 'empty';
  if (data?.response_format === 'html') return 'html';
  if (data?.response_format === 'text') return 'text';
  return 'json';
}

function logApiTiming({
  startedAt,
  method,
  path,
  status,
  responseFormat,
  timeout,
  timedOut = false,
  retryUsed = false,
  errorType,
}: {
  startedAt: number;
  method: string;
  path: string;
  status?: number;
  responseFormat?: 'json' | 'html' | 'text' | 'empty';
  timeout: number;
  timedOut?: boolean;
  retryUsed?: boolean;
  errorType?: string;
}) {
  logPerf('API request', startedAt, {
    endpoint: safeEndpointFromPath(path),
    method,
    status: status ?? null,
    responseType: responseFormat ?? null,
    timeoutMs: timeout,
    timedOut,
    retryUsed,
    errorType,
  });
}

function logRequest(method: string, url: string) {
  if (API_DEBUG) {
    console.log(`API ${method}:`, safeEndpointFromUrl(url));
  }
}

function logStatus(method: string, url: string, res: Response) {
  if (API_DEBUG) {
    console.log(`API ${method} STATUS:`, res.status, safeEndpointFromUrl(url));
  }
}

function logApiError(error: ApiError) {
  if (API_DEBUG) {
    console.log('API ERROR:', {
      method: error.method,
      endpoint: error.url ? safeEndpointFromUrl(error.url) : undefined,
      status: error.status,
      type: error.type,
      responseFormat: error.responseFormat,
    });
  }
  noteFailedBackendResponse(error);
}

function attachRequest(error: ApiError, method: string, url: string): ApiError {
  return { ...error, method, url };
}

function makeStaleSessionError(method: string, url: string, requestSessionVersion?: string): ApiError {
  return attachRequest({
    status: 0,
    data: { message: 'Stale session request ignored.' },
    type: 'unknown',
    message: 'Stale session request ignored.',
    isNetworkError: false,
    isAuthError: false,
    isValidationError: false,
    isStaleSessionError: true,
    requestSessionVersion,
  }, method, url);
}

function normalizeFetchError(error: any, method: string, url: string, requestSessionVersion?: string): ApiError {
  if (error?.type) {
    const normalized = attachRequest({ ...error, requestSessionVersion }, method, url);
    logApiError(normalized);
    return normalized;
  }
  if (error?.isStaleSessionError) {
    return error;
  }
  if (error?.name === 'AbortError') {
    const normalized: ApiError = attachRequest({
      status: 408,
      data: { message: 'Request timeout' },
      type: 'timeout',
      message: 'Request timed out. Please try again.',
      isNetworkError: true,
      isAuthError: false,
      isValidationError: false,
      requestSessionVersion,
    }, method, url);
    logApiError(normalized);
    return normalized;
  }
  const normalized: ApiError = attachRequest({
    status: 0,
    data: { message: error?.message || 'Backend unavailable.' },
    type: 'network',
    message: 'Backend unavailable.',
    isNetworkError: true,
    isAuthError: false,
    isValidationError: false,
    requestSessionVersion,
  }, method, url);
  logApiError(normalized);
  return normalized;
}

async function ensureCurrentSession(method: string, url: string, token?: string, requestSessionVersion?: string) {
  if (token && requestSessionVersion && !(await isAuthSessionContextCurrent({ sessionVersion: requestSessionVersion, token }))) {
    throw makeStaleSessionError(method, url, requestSessionVersion);
  }
}

function isHtmlResponse(text: string, res?: Response) {
  const contentType = res?.headers?.get('content-type')?.toLowerCase() || '';
  const trimmed = text.trim().toLowerCase();
  return contentType.includes('text/html') || trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

function makeStaleGetError(method: string, url: string, requestSessionVersion?: string): ApiError {
  return attachRequest({
    status: 0,
    data: { message: 'Stale GET response ignored.' },
    type: 'unknown',
    message: 'Stale GET response ignored.',
    isNetworkError: false,
    isAuthError: false,
    isValidationError: false,
    isStaleSessionError: false,
    requestSessionVersion,
  }, method, url);
}

async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  if (isHtmlResponse(text, res)) {
    return { message: 'Server route not found. Please check API configuration.', response_format: 'html' };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: 'Unexpected server response. Please try again.', raw: text, response_format: 'text' };
  }
}

function throwIfUnexpectedSuccessfulResponse(data: any, res: Response) {
  if (data?.response_format === 'html' || data?.response_format === 'text') {
    throw makeBackendUnavailableError(res.status, data, 'Backend returned an unexpected response.');
  }
}

function joinPath(path: string) {
  if (!BASE_URL) {
    throw {
      status: 0,
      data: { message: 'EXPO_PUBLIC_API_URL is not configured.' },
      type: 'network',
      message: 'EXPO_PUBLIC_API_URL is not configured.',
      isNetworkError: true,
      isAuthError: false,
      isValidationError: false,
    } satisfies ApiError;
  }
  if (!path) return BASE_URL;
  if (path.startsWith('/')) return `${BASE_URL}${path}`;
  return `${BASE_URL}/${path}`;
}

export async function post(path: string, body: any, token?: string, timeout: number = 10000) {
  const startedAt = perfNow();
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const requestSessionVersion = token ? getCurrentAuthSessionVersion() : undefined;
  const controller = createTrackedAbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('POST', url);
  try {
    await ensureCurrentSession('POST', url, token, requestSessionVersion);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    logStatus('POST', url, res);
    const data = await parseResponse(res);
    const responseFormat = responseFormatFor(data);
    await ensureCurrentSession('POST', url, token, requestSessionVersion);
    throwIfUnexpectedSuccessfulResponse(data, res);
    if (!res.ok) {
      notifyAuthenticatedRequestFailure(res.status, token);
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    noteSuccessfulBackendResponse(data);
    invalidateApiCacheAfterMutation(path, token);
    logApiTiming({ startedAt, method: 'POST', path, status: res.status, responseFormat, timeout });
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    const normalized = normalizeFetchError(error, 'POST', url, requestSessionVersion);
    logApiTiming({
      startedAt,
      method: 'POST',
      path,
      status: normalized.status,
      responseFormat: normalized.responseFormat || responseFormatFor(normalized.data),
      timeout,
      timedOut: normalized.type === 'timeout',
      errorType: normalized.type,
    });
    throw normalized;
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export async function get(path: string, token?: string, timeout: number = 10000) {
  const startedAt = perfNow();
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const requestSessionVersion = token ? getCurrentAuthSessionVersion() : undefined;
  const url = joinPath(path);
  const rule = getTtlRule(path);
  const cacheKey = getRequestCacheKey('GET', path, token, requestSessionVersion);
  const groupVersionKey = rule ? getGroupVersionKey(rule.group, token, requestSessionVersion) : '';
  const capturedGroupVersion = rule ? getCacheGroupVersion(rule.group, token, requestSessionVersion) : 0;
  const requestToken = Symbol(cacheKey);
  logRequest('GET', url);

  if (rule) {
    const cached = getTtlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logPerf('API request', startedAt, {
        endpoint: safeEndpointFromPath(path),
        method: 'GET',
        source: 'ttl_cache',
        ttlMs: rule.ttlMs,
      });
      return cached.data;
    }

    if (isBackendCooldownActive(path)) {
      const cooldownError = makeBackendCooldownError('GET', url, requestSessionVersion);
      logPerf('API request', startedAt, {
        endpoint: safeEndpointFromPath(path),
        method: 'GET',
        source: 'backend_cooldown_skip',
        cooldownMs: BACKEND_UNAVAILABLE_COOLDOWN_MS,
      });
      throw cooldownError;
    }

    const existing = getInFlightRequests.get(cacheKey);
    if (existing) {
      logPerf('API request', startedAt, {
        endpoint: safeEndpointFromPath(path),
        method: 'GET',
        source: 'coalesced_in_flight',
      });
      return existing.promise;
    }
  }

  const controller = createTrackedAbortController();
  const networkRequest = (async () => {
    const networkStartedAt = perfNow();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      await ensureCurrentSession('GET', url, token, requestSessionVersion);
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      logStatus('GET', url, res);
      const data = await parseResponse(res);
      const responseFormat = responseFormatFor(data);
      await ensureCurrentSession('GET', url, token, requestSessionVersion);
      throwIfUnexpectedSuccessfulResponse(data, res);
      if (!res.ok) {
        notifyAuthenticatedRequestFailure(res.status, token);
        const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
        throw { ...error, requestSessionVersion };
      }
      noteSuccessfulBackendResponse(data);
      if (rule && getCacheGroupVersion(rule.group, token, requestSessionVersion) !== capturedGroupVersion) {
        logPerf('stale_get_discarded', networkStartedAt, {
          endpoint: safeEndpointFromPath(path),
          group: rule.group,
        });
        throw makeStaleGetError('GET', url, requestSessionVersion);
      }
      if (rule && res.status !== 401 && res.status !== 403) {
        getTtlCache.set(cacheKey, { data, expiresAt: Date.now() + rule.ttlMs });
      }
      logApiTiming({ startedAt: networkStartedAt, method: 'GET', path, status: res.status, responseFormat, timeout });
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const normalized = normalizeFetchError(error, 'GET', url, requestSessionVersion);
      logApiTiming({
        startedAt: networkStartedAt,
        method: 'GET',
        path,
        status: normalized.status,
        responseFormat: normalized.responseFormat || responseFormatFor(normalized.data),
        timeout,
        timedOut: normalized.type === 'timeout',
        errorType: normalized.type,
      });
      throw normalized;
    } finally {
      releaseTrackedAbortController(controller);
      if (rule && getInFlightRequests.get(cacheKey)?.requestToken === requestToken) {
        getInFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (rule) {
    getInFlightRequests.set(cacheKey, {
      promise: networkRequest,
      group: rule.group,
      groupVersionKey,
      groupVersion: capturedGroupVersion,
      requestToken,
      controller,
    });
    logPerf('API request', startedAt, {
      endpoint: safeEndpointFromPath(path),
      method: 'GET',
      source: 'network_new',
    });
  }

  return networkRequest;
}

export async function put(path: string, body: any, token?: string, timeout: number = 10000) {
  const startedAt = perfNow();
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const requestSessionVersion = token ? getCurrentAuthSessionVersion() : undefined;
  const controller = createTrackedAbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('PUT', url);
  try {
    await ensureCurrentSession('PUT', url, token, requestSessionVersion);
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    logStatus('PUT', url, res);
    const data = await parseResponse(res);
    const responseFormat = responseFormatFor(data);
    await ensureCurrentSession('PUT', url, token, requestSessionVersion);
    throwIfUnexpectedSuccessfulResponse(data, res);
    if (!res.ok) {
      notifyAuthenticatedRequestFailure(res.status, token);
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    noteSuccessfulBackendResponse(data);
    invalidateApiCacheAfterMutation(path, token);
    logApiTiming({ startedAt, method: 'PUT', path, status: res.status, responseFormat, timeout });
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    const normalized = normalizeFetchError(error, 'PUT', url, requestSessionVersion);
    logApiTiming({
      startedAt,
      method: 'PUT',
      path,
      status: normalized.status,
      responseFormat: normalized.responseFormat || responseFormatFor(normalized.data),
      timeout,
      timedOut: normalized.type === 'timeout',
      errorType: normalized.type,
    });
    throw normalized;
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export async function del(path: string, token?: string, timeout: number = 10000) {
  const startedAt = perfNow();
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const requestSessionVersion = token ? getCurrentAuthSessionVersion() : undefined;
  const controller = createTrackedAbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('DELETE', url);
  try {
    await ensureCurrentSession('DELETE', url, token, requestSessionVersion);
    const res = await fetch(url, { method: 'DELETE', headers, signal: controller.signal });
    clearTimeout(timeoutId);
    logStatus('DELETE', url, res);
    const data = await parseResponse(res);
    const responseFormat = responseFormatFor(data);
    await ensureCurrentSession('DELETE', url, token, requestSessionVersion);
    throwIfUnexpectedSuccessfulResponse(data, res);
    if (!res.ok) {
      notifyAuthenticatedRequestFailure(res.status, token);
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    noteSuccessfulBackendResponse(data);
    invalidateApiCacheAfterMutation(path, token);
    logApiTiming({ startedAt, method: 'DELETE', path, status: res.status, responseFormat, timeout });
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    const normalized = normalizeFetchError(error, 'DELETE', url, requestSessionVersion);
    logApiTiming({
      startedAt,
      method: 'DELETE',
      path,
      status: normalized.status,
      responseFormat: normalized.responseFormat || responseFormatFor(normalized.data),
      timeout,
      timedOut: normalized.type === 'timeout',
      errorType: normalized.type,
    });
    throw normalized;
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export function defaultMessageForStatus(status?: number) {
  if (status === 404) return 'API route not found.';
  if (status === 408) return 'Request timed out. Please try again.';
  if (status === 422) return 'Please check the highlighted fields.';
  if (status === 401) return 'Authentication failed.';
  if (status && status >= 500) return 'Server error. Check backend logs.';
  return 'Request failed.';
}

export function getErrorTitle(error: any, fallbackTitle = 'Request Failed') {
  if (error?.type === 'validation' || error?.status === 422) return 'Validation Error';
  if (error?.type === 'auth' || error?.status === 401) return 'Invalid Credentials';
  if (error?.type === 'not_found' || error?.status === 404) return 'API Route Not Found';
  if (error?.type === 'timeout' || error?.status === 408) return 'Request Timeout';
  if (error?.type === 'network' || error?.status === 0) return 'Cannot Reach Backend';
  if (error?.type === 'server' || (error?.status && error.status >= 500)) return 'Server Error';
  return fallbackTitle;
}

export function getErrorMessage(error: any, fallbackMessage = 'Request failed.') {
  if (typeof error?.data === 'string' && isHtmlResponse(error.data)) {
    return 'Server route not found. Please check API configuration.';
  }
  return error?.message || error?.data?.message || error?.data || defaultMessageForStatus(error?.status) || fallbackMessage;
}

export function isStaleGetError(error: any) {
  return error?.message === 'Stale GET response ignored.' || error?.data?.message === 'Stale GET response ignored.';
}

export async function postWithMeta(path: string, body: any, token?: string, timeout: number = 10000) {
  const startedAt = perfNow();
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const requestSessionVersion = token ? getCurrentAuthSessionVersion() : undefined;
  const controller = createTrackedAbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('POST', url);
  try {
    await ensureCurrentSession('POST', url, token, requestSessionVersion);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    logStatus('POST', url, res);
    const data = await parseResponse(res);
    const responseFormat = responseFormatFor(data);
    await ensureCurrentSession('POST', url, token, requestSessionVersion);
    throwIfUnexpectedSuccessfulResponse(data, res);
    if (!res.ok) {
      notifyAuthenticatedRequestFailure(res.status, token);
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    noteSuccessfulBackendResponse(data);
    invalidateApiCacheAfterMutation(path, token);
    logApiTiming({ startedAt, method: 'POST', path, status: res.status, responseFormat, timeout });
    return {
      data,
      status: res.status,
      responseFormat,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const normalized = normalizeFetchError(error, 'POST', url, requestSessionVersion);
    logApiTiming({
      startedAt,
      method: 'POST',
      path,
      status: normalized.status,
      responseFormat: normalized.responseFormat || responseFormatFor(normalized.data),
      timeout,
      timedOut: normalized.type === 'timeout',
      errorType: normalized.type,
    });
    throw normalized;
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export async function checkBackendReachability(token?: string, force = false) {
  const startedAt = perfNow();
  const now = Date.now();
  if (!force && backendReachabilityState.reachable !== null && now - backendReachabilityState.checkedAt < BACKEND_REACHABILITY_TTL_MS) {
    logPerf('Backend reachability check', startedAt, {
      reachable: backendReachabilityState.reachable,
      source: 'cache',
      force,
    });
    return backendReachabilityState.reachable;
  }
  if (backendReachabilityPromise) {
    logPerf('Backend reachability check', startedAt, {
      reachable: backendReachabilityState.reachable,
      source: 'in_flight',
      force,
    });
    return backendReachabilityPromise;
  }

  backendReachabilityPromise = (async () => {
    if (force) {
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_GRACE_MS));
    }

    const netState = await NetInfo.fetch();
    const deviceOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);
    if (!deviceOnline) {
      setBackendReachability(false, 'Device is offline.');
      logPerf('Backend reachability check', startedAt, {
        reachable: false,
        source: 'netinfo',
        deviceOnline,
        force,
      });
      return false;
    }

    backendReachabilityState.checking = true;
    emitBackendReachability();
    try {
      const response = await get('/ping', token, 3500);
      const reachable = Boolean(response?.ok === true || response?.pong === true || response?.app === 'IntakeSync');
      setBackendReachability(reachable, reachable ? null : 'Invalid backend ping response.');
      logPerf('Backend reachability check', startedAt, {
        reachable,
        source: 'ping',
        deviceOnline,
        force,
      });
      return reachable;
    } catch (error: any) {
      setBackendReachability(false, error?.message || 'Backend unavailable.');
      logPerf('Backend reachability check', startedAt, {
        reachable: false,
        source: 'ping',
        deviceOnline,
        force,
        errorType: error?.type || 'unknown',
      });
      return false;
    } finally {
      backendReachabilityState.checking = false;
      emitBackendReachability();
    }
  })().finally(() => {
    backendReachabilityPromise = null;
  });

  return backendReachabilityPromise;
}

export function shouldSkipBackendRefresh(path: string) {
  const startedAt = perfNow();
  const skip = Boolean(getTtlRule(path) && isBackendCooldownActive(path));
  if (skip) {
    logPerf('API request', startedAt, {
      endpoint: safeEndpointFromPath(path),
      method: 'GET',
      source: 'backend_cooldown_skip_probe',
    });
  }
  return skip;
}

export function isNetworkError(error: any) {
  if (isStaleGetError(error)) return false;
  return error?.isNetworkError || error?.type === 'network' || error?.type === 'timeout' || error?.status === 0 || error?.status === 408;
}

export function isAuthError(error: any) {
  if (error?.isStaleSessionError) return false;
  return error?.isAuthError || error?.type === 'auth' || error?.status === 401;
}

export function isValidationError(error: any) {
  return error?.isValidationError || error?.type === 'validation' || error?.status === 422;
}

export function isStaleSessionError(error: any) {
  return Boolean(error?.isStaleSessionError);
}

export default { post, get, put, del, isNetworkError, isAuthError, isValidationError, isStaleSessionError, isStaleGetError, isBackendReachabilityError, getErrorTitle, getErrorMessage, checkBackendReachability, subscribeBackendReachability, invalidateApiCacheForPath, invalidateApiCacheGroup, shouldSkipBackendRefresh, abortAllPendingRequests };
