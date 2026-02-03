import {
  SPORTFENGUR_BASE_URL,
  SPORTFENGUR_USERNAME,
  SPORTFENGUR_PASSWORD,
  MIN_FETCH_INTERVAL_MS,
  FETCH_MAX_RETRIES,
  FETCH_RETRY_BASE_MS,
} from './config.js';

let authToken = '';
let lastFetchAt = 0;
let apiRequestQueue = Promise.resolve();
const responseCache = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  if (!SPORTFENGUR_USERNAME || !SPORTFENGUR_PASSWORD) {
    throw new Error(
      'Missing SportFengur credentials (EIDFAXI_USERNAME / EIDFAXI_PASSWORD).',
    );
  }

  const response = await fetch(`${SPORTFENGUR_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: SPORTFENGUR_USERNAME,
      password: SPORTFENGUR_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error('Login failed (no token)');
  }

  authToken = data.token;
  return authToken;
}

async function getAuthToken() {
  if (authToken) {
    return authToken;
  }
  return login();
}

async function withRateLimit(task) {
  apiRequestQueue = apiRequestQueue.then(async () => {
    const now = Date.now();
    const waitFor = Math.max(0, MIN_FETCH_INTERVAL_MS - (now - lastFetchAt));
    if (waitFor > 0) {
      await delay(waitFor);
    }
    lastFetchAt = Date.now();
    return task();
  });
  return apiRequestQueue;
}

async function apiGet(path) {
  return withRateLimit(async () => {
    const token = await getAuthToken();
    const response = await fetch(`${SPORTFENGUR_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const error = new Error(
        `SportFengur GET ${path} failed (${response.status})`,
      );
      error.status = response.status;
      throw error;
    }

    return response.json();
  });
}

export async function apiGetWithRetry(path) {
  for (let attempt = 0; attempt <= FETCH_MAX_RETRIES; attempt += 1) {
    try {
      const data = await apiGet(path);
      responseCache.set(path, data);
      return data;
    } catch (error) {
      const status = error.status || 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt === FETCH_MAX_RETRIES) {
        if (responseCache.has(path)) {
          console.warn(`Using cached response for ${path} after failure.`);
          return responseCache.get(path);
        }
        throw error;
      }
      const backoff = FETCH_RETRY_BASE_MS * 2 ** attempt;
      await delay(backoff);
    }
  }
  throw new Error(`SportFengur GET ${path} failed (retries exhausted)`);
}
