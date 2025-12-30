import axios from 'axios';



const URL = import.meta.env.VITE_API_URL 
console.log("API URL:", URL);
const api = axios.create({
  baseURL: `${URL}/api`,
  timeout: 120000, // 2 minutes for long-running sync operations
});

// Simple in-memory cache for GET requests to reduce repeated network calls
const cache = new Map();
const DEFAULT_TTL = 30 * 1000; // 30s

export async function getWithCache(url, { ttl = DEFAULT_TTL } = {}) {
  const key = url;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && (now - cached.ts) < ttl) {
    return cached.value;
  }

  const controller = new AbortController();
  try {
    const res = await api.get(url, { signal: controller.signal });
    cache.set(key, { value: res, ts: Date.now() });
    return res;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export default api;
