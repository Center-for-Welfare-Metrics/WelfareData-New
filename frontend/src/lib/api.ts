import axios from "axios";

const PUBLIC_PATHS = ["/view"];

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes("/auth/")
    ) {
      const isPublicPage = PUBLIC_PATHS.some((p) =>
        window.location.pathname.startsWith(p)
      );
      if (!isPublicPage) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
