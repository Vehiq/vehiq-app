import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const adminApi = axios.create({ baseURL: `${BACKEND_URL}/api` });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("sharago_admin_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("sharago_admin_token");
    }
    return Promise.reject(err);
  }
);

export default adminApi;
