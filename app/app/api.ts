import {
  abortAllPendingRequests,
  createTrackedAbortController,
  getCurrentAuthSessionVersion,
  isAuthSessionContextCurrent,
  releaseTrackedAbortController,
} from '../services/authSession';

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

function logRequest(method: string, url: string) {
  if (API_DEBUG) {
    console.log(`API ${method}:`, url);
  }
}

function logStatus(method: string, url: string, res: Response) {
  if (API_DEBUG) {
    console.log(`API ${method} STATUS:`, res.status, url);
  }
}

function logApiError(error: ApiError) {
  if (API_DEBUG) {
    console.log('API ERROR:', {
      method: error.method,
      url: error.url,
      status: error.status,
      type: error.type,
      message: error.message,
      data: error.data,
    });
  }
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
    await ensureCurrentSession('POST', url, token, requestSessionVersion);
    if (!res.ok) {
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error, 'POST', url, requestSessionVersion);
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export async function get(path: string, token?: string, timeout: number = 10000) {
  const headers: any = { Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const requestSessionVersion = token ? getCurrentAuthSessionVersion() : undefined;
  
  // Add timeout to prevent infinite hanging
  const controller = createTrackedAbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('GET', url);
  
  try {
    await ensureCurrentSession('GET', url, token, requestSessionVersion);
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    logStatus('GET', url, res);
    const data = await parseResponse(res);
    await ensureCurrentSession('GET', url, token, requestSessionVersion);
    if (!res.ok) {
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error, 'GET', url, requestSessionVersion);
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export async function put(path: string, body: any, token?: string, timeout: number = 10000) {
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
    await ensureCurrentSession('PUT', url, token, requestSessionVersion);
    if (!res.ok) {
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error, 'PUT', url, requestSessionVersion);
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export async function del(path: string, token?: string, timeout: number = 10000) {
  const headers: any = { Accept: 'application/json', ...ngrokHeaders };
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
    await ensureCurrentSession('DELETE', url, token, requestSessionVersion);
    if (!res.ok) {
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error, 'DELETE', url, requestSessionVersion);
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

export async function postWithMeta(path: string, body: any, token?: string, timeout: number = 10000) {
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
    await ensureCurrentSession('POST', url, token, requestSessionVersion);
    if (!res.ok) {
      const error = makeApiError(res.status, data, defaultMessageForStatus(res.status));
      throw { ...error, requestSessionVersion };
    }
    return {
      data,
      status: res.status,
      responseFormat: data?.response_format ? data.response_format : 'json',
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error, 'POST', url, requestSessionVersion);
  } finally {
    releaseTrackedAbortController(controller);
  }
}

export function isNetworkError(error: any) {
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

export default { post, get, put, del, isNetworkError, isAuthError, isValidationError, isStaleSessionError, getErrorTitle, getErrorMessage, abortAllPendingRequests };
