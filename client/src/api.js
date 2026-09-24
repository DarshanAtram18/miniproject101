import axios from 'axios';

export const SESSION_KEY = 'wce_prof_insights_session_v2';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 45_000,
  headers: { 'Content-Type': 'application/json' }
});

let authFailureHandler = null;

export const setAuthFailureHandler = (handler) => {
  authFailureHandler = handler;
};

export const setApiToken = (token) => {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
};

export const getActiveToken = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed.token || '';
  } catch {
    return '';
  }
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
      localStorage.removeItem(SESSION_KEY);
      setApiToken(null);
      authFailureHandler?.(error.response?.data?.error || 'Your session has expired. Please sign in again.');
    }
    return Promise.reject(error);
  }
);

export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => (
  error.response?.data?.error || error.message || fallback
);

export const downloadResponse = (response, fallbackFilename) => {
  const disposition = response.headers?.['content-disposition'] || '';
  const utfName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  const filename = utfName ? decodeURIComponent(utfName) : quotedName || fallbackFilename;
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  // Delay revoke so browser has time to start the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 60000);
};

/**
 * When axios fetches with responseType:'blob' and the server returns a JSON error,
 * the error body is a Blob. This helper reads it back to get the error message.
 */
export const getBlobErrorMessage = async (error, fallback = 'Something went wrong. Please try again.') => {
  if (error.response?.data instanceof Blob) {
    try {
      const text = await error.response.data.text();
      const parsed = JSON.parse(text);
      return parsed.error || parsed.message || fallback;
    } catch {
      return fallback;
    }
  }
  return getErrorMessage(error, fallback);
};

export default api;
