import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "";

const rolesAPI = axios.create({
  baseURL: `${baseURL}/api/roles`,
  headers: {
    "Content-Type": "application/json",
  },
});

rolesAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const fetchRoles = () => rolesAPI.get("/");

export const fetchRole = (id) => rolesAPI.get(`/${id}`);

export const fetchPermissionsSchema = () => rolesAPI.get("/schema");

export const createRole = (data) => rolesAPI.post("/", data);

export const updateRole = (id, data) => rolesAPI.put(`/${id}`, data);

export const deleteRole = (id) => rolesAPI.delete(`/${id}`);

export const toggleRole = (id) => rolesAPI.patch(`/${id}/toggle`);

export default rolesAPI;
