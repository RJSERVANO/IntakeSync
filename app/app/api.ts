const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  'https://pseudohexagonal-minna-unobsolete.ngrok-free.dev/api';

if (__DEV__) {
  console.log('API BASE_URL:', BASE_URL);
}

const ngrokHeaders =
  BASE_URL.includes('ngrok-free.dev') || BASE_URL.includes('ngrok.app')
    ? { 'ngrok-skip-browser-warning': 'true' }
    : {};

export type ApiErrorType = 'auth' | 'network' | 'timeout' | 'validation' | 'server' | 'unknown';

export interface ApiError {
  status?: number;
  data?: any;
  type: ApiErrorType;
  message: string;
  isNetworkError?: boolean;
  isAuthError?: boolean;
  isValidationError?: boolean;
}

function makeApiError(status: number | undefined, data: any, fallbackMessage: string): ApiError {
  const message = data?.message || data || fallbackMessage;
  const type: ApiErrorType =
    status === 401 ? 'auth' :
    status === 422 ? 'validation' :
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
  };
}

function logRequest(method: string, url: string) {
  if (__DEV__) {
    console.log(`API ${method}:`, url);
  }
}

function logStatus(res: Response) {
  if (__DEV__) {
    console.log('API STATUS:', res.status);
  }
}

function logApiError(error: ApiError) {
  if (__DEV__) {
    console.log('API ERROR TYPE:', error.type);
  }
}

function normalizeFetchError(error: any): ApiError {
  if (error?.type) {
    logApiError(error);
    return error;
  }
  if (error?.name === 'AbortError') {
    const normalized: ApiError = {
      status: 408,
      data: { message: 'Request timeout' },
      type: 'timeout',
      message: 'Request timeout',
      isNetworkError: true,
      isAuthError: false,
      isValidationError: false,
    };
    logApiError(normalized);
    return normalized;
  }
  const normalized: ApiError = {
    status: 0,
    data: { message: error?.message || 'Backend unavailable' },
    type: 'network',
    message: error?.message || 'Backend unavailable',
    isNetworkError: true,
    isAuthError: false,
    isValidationError: false,
  };
  logApiError(normalized);
  return normalized;
}

async function parseResponse(res: Response) {

  try {
    const json = await res.json();
    return json;
  } catch {
    try {
      const text = await res.text();
      return text;
    } catch {
      return null;
    }
  }
}

function joinPath(path: string) {
  if (!path) return BASE_URL;
  if (path.startsWith('/')) return `${BASE_URL}${path}`;
  return `${BASE_URL}/${path}`;
}

export async function post(path: string, body: any, token?: string, timeout: number = 10000) {
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('POST', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    logStatus(res);
    const data = await parseResponse(res);
    if (!res.ok) throw makeApiError(res.status, data, 'Request failed');
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error);
  }
}

export async function get(path: string, token?: string, timeout: number = 10000) {
  const headers: any = { Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  // Add timeout to prevent infinite hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('GET', url);
  
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    logStatus(res);
    const data = await parseResponse(res);
    if (!res.ok) throw makeApiError(res.status, data, 'Request failed');
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error);
  }
}

export async function put(path: string, body: any, token?: string, timeout: number = 10000) {
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('PUT', url);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    logStatus(res);
    const data = await parseResponse(res);
    if (!res.ok) throw makeApiError(res.status, data, 'Request failed');
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error);
  }
}

export async function del(path: string, token?: string, timeout: number = 10000) {
  const headers: any = { Accept: 'application/json', ...ngrokHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const url = joinPath(path);
  logRequest('DELETE', url);
  try {
    const res = await fetch(url, { method: 'DELETE', headers, signal: controller.signal });
    clearTimeout(timeoutId);
    logStatus(res);
    const data = await parseResponse(res);
    if (!res.ok) throw makeApiError(res.status, data, 'Request failed');
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw normalizeFetchError(error);
  }
}

export function isNetworkError(error: any) {
  return error?.isNetworkError || error?.type === 'network' || error?.type === 'timeout' || error?.status === 0 || error?.status === 408;
}

export function isAuthError(error: any) {
  return error?.isAuthError || error?.type === 'auth' || error?.status === 401;
}

export default { post, get, put, del, isNetworkError, isAuthError };
