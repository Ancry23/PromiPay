import axios from "axios";
import { tokens } from "./tokens";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/";

const api = axios.create({ baseURL });

let refreshPromise = null;
let onAuthFailure = () => {};

export function setAuthFailureHandler(handler) {
  onAuthFailure = handler;
}

api.interceptors.request.use((config) => {
  const access = tokens.getAccess();
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall = /^auth\/(token|logout|password\/reset)/.test(original?.url ?? "");

    if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
      return Promise.reject(error);
    }

    const refresh = tokens.getRefresh();
    if (!refresh) {
      onAuthFailure();
      return Promise.reject(error);
    }

    try {
      // Share one refresh request between concurrent 401s.
      refreshPromise ??= axios
        .post(`${baseURL}auth/token/refresh/`, { refresh })
        .then((response) => {
          tokens.set({ access: response.data.access, refresh: response.data.refresh });
          return response.data.access;
        })
        .finally(() => {
          refreshPromise = null;
        });

      const access = await refreshPromise;
      original._retried = true;
      original.headers.Authorization = `Bearer ${access}`;
      return api(original);
    } catch (refreshError) {
      tokens.clear();
      onAuthFailure();
      return Promise.reject(refreshError);
    }
  }
);

export function listResults(data) {
  return Array.isArray(data) ? data : data?.results ?? [];
}

export async function fetchAll(url, params = {}) {
  const items = [];
  let response = await api.get(url, { params: { ...params, page_size: 500 } });

  for (;;) {
    items.push(...listResults(response.data));
    const next = response.data?.next;
    if (!next) break;
    response = await api.get(next);
  }

  return items;
}

export function apiErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data || typeof data !== "object") return fallback;
  if (typeof data.detail === "string") return data.detail;

  const messages = Object.values(data).flat().filter((value) => typeof value === "string");
  return messages.length > 0 ? messages.join(" ") : fallback;
}

export default api;
