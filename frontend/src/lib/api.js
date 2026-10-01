import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config;
    if (error.response?.status === 401 && !cfg._retry && !cfg.url.includes("/auth/")) {
      cfg._retry = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh");
        await refreshing;
        refreshing = null;
        return api(cfg);
      } catch (e) {
        refreshing = null;
      }
    }
    return Promise.reject(error);
  }
);

export const studentApi = () =>
  axios.create({ baseURL: API, headers: { "X-Session-Token": sessionStorage.getItem("exam_token") || "" } });

export function formatErr(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Une erreur est survenue.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || JSON.stringify(d)).join(" ");
  return detail.msg || String(detail);
}
