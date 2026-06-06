import axios from "axios";
import qs from "qs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── 简单 TTL 内存缓存 ─────────────────────────────────────────────────────────
const _cache = new Map<string, { data: unknown; expires: number }>();

function cached<T>(key: string, fetcher: () => Promise<T>, ttl = 30_000): Promise<T> {
  const hit = _cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.data as T);
  return fetcher().then((data) => {
    _cache.set(key, { data, expires: Date.now() + ttl });
    return data;
  });
}

function bust(...keys: string[]) {
  keys.forEach((k) => _cache.delete(k));
}

export const api = axios.create({
  baseURL: API_BASE,
  paramsSerializer: { serialize: (params) => qs.stringify(params, { arrayFormat: "repeat" }) },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data: { email: string; password: string; username?: string }) =>
    api.post("/api/auth/register", data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    api.post("/api/auth/login", data).then((r) => r.data),
  me: () => cached("auth:me", () => api.get("/api/auth/me").then((r) => r.data), 5 * 60_000),
  updateProfile: (data: object) =>
    api.put("/api/auth/me", data).then((r) => { bust("auth:me"); return r.data; }),
};

// Projects
export const projectsApi = {
  list: () => api.get("/api/projects").then((r) => r.data),
  create: (data: object) => api.post("/api/projects", data).then((r) => r.data),
  get: (id: number) => api.get(`/api/projects/${id}`).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/api/projects/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/api/projects/${id}`).then((r) => r.data),
  analyze: (id: number) => api.post(`/api/projects/${id}/analyze`).then((r) => r.data),
  createSession: (id: number, company?: string) =>
    api.post(`/api/projects/${id}/interview`, null, { params: { mock_company: company } }).then((r) => r.data),
  getSessions: (id: number) => api.get(`/api/projects/${id}/sessions`).then((r) => r.data),
  getMessages: (sessionId: number) =>
    api.get(`/api/projects/sessions/${sessionId}/messages`).then((r) => r.data),
  endSession: (sessionId: number) =>
    api.post(`/api/projects/sessions/${sessionId}/end`).then((r) => r.data),
};

// Questions
export const questionsApi = {
  list: (params?: object) => api.get("/api/questions", { params }).then((r) => r.data),
  categories: () => api.get("/api/questions/categories").then((r) => r.data),
  get: (id: number, revealAnswer?: boolean) =>
    api.get(`/api/questions/${id}`, { params: { reveal_answer: revealAnswer } }).then((r) => r.data),
  submitAnswer: (id: number, answer: string) =>
    api.post(`/api/questions/${id}/answer`, { user_answer: answer }).then((r) => r.data),
  followUp: (questionId: number, answer: string) =>
    api.post("/api/questions/follow-up", null, { params: { question_id: questionId, user_answer: answer } }).then((r) => r.data),
  mistakes: () => api.get("/api/questions/mistakes/list").then((r) => r.data),
  getMastery: (params: { category?: string; subcategory?: string; set_id?: number; set_ids?: number[] }) =>
    api.get("/api/questions/mastery", { params }).then((r) => r.data),
  setMastery: (id: number, mastery: string) =>
    api.post(`/api/questions/${id}/mastery`, { mastery }).then((r) => r.data),
  resetMastery: (id: number) =>
    api.delete(`/api/questions/${id}/mastery`).then((r) => r.data),
};

// Algorithm
export const algorithmApi = {
  getLists: () => cached("algo:lists", () => api.get("/api/algorithm/lists").then((r) => r.data), 60_000),
  selectList: (listId: number) =>
    api.post("/api/algorithm/lists/select", null, { params: { list_id: listId } }).then((r) => {
      bust("algo:lists", "algo:daily");
      return r.data;
    }),
  getProgress: () => api.get("/api/algorithm/lists/progress").then((r) => r.data),
  daily: () => cached("algo:daily", () => api.get("/api/algorithm/daily").then((r) => r.data), 5 * 60_000),
  record: (data: object) =>
    api.post("/api/algorithm/record", data).then((r) => { bust("algo:daily"); return r.data; }),
  weakness: () => cached("algo:weakness", () => api.get("/api/algorithm/weakness").then((r) => r.data), 60_000),
};

// Admin
export const adminApi = {
  files: () => api.get("/api/admin/files").then((r) => r.data),
  getFile: (category: string, filename: string) =>
    api.get(`/api/admin/files/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`).then((r) => r.data),
  saveFile: (category: string, filename: string, content: string) =>
    api.put(`/api/admin/files/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { content }).then((r) => r.data),
  makeAdmin: (email: string) =>
    api.post("/api/admin/make-admin", { email }).then((r) => r.data),
};

// Question Sets
export const questionSetsApi = {
  list: () => cached("qsets:list", () => api.get("/api/question-sets").then((r) => r.data), 60_000),
  active: () => cached("qsets:active", () => api.get("/api/question-sets/active").then((r) => r.data), 60_000),
  select: (set_id: number) =>
    api.post("/api/question-sets/select", null, { params: { set_id } }).then((r) => {
      bust("qsets:list", "qsets:active");
      return r.data;
    }),
  create: (data: { name: string; description?: string }) =>
    api.post("/api/question-sets", data).then((r) => { bust("qsets:list"); return r.data; }),
  get: (id: number) => api.get(`/api/question-sets/${id}`).then((r) => r.data),
  update: (id: number, data: object) =>
    api.put(`/api/question-sets/${id}`, data).then((r) => { bust("qsets:list"); return r.data; }),
  delete: (id: number) =>
    api.delete(`/api/question-sets/${id}`).then((r) => { bust("qsets:list", "qsets:active"); return r.data; }),
  addItem: (setId: number, question_id: number) =>
    api.post(`/api/question-sets/${setId}/items`, { question_id }).then((r) => r.data),
  removeItem: (setId: number, questionId: number) =>
    api.delete(`/api/question-sets/${setId}/items/${questionId}`).then((r) => r.data),
  // Admin
  adminCreate: (data: object) => api.post("/api/question-sets/admin/sets", data).then((r) => r.data),
  adminUpdate: (id: number, data: object) =>
    api.put(`/api/question-sets/admin/sets/${id}`, data).then((r) => r.data),
  adminDelete: (id: number) => api.delete(`/api/question-sets/admin/sets/${id}`).then((r) => r.data),
  adminAddItem: (setId: number, question_id: number) =>
    api.post(`/api/question-sets/admin/sets/${setId}/items`, { question_id }).then((r) => r.data),
  adminRemoveItem: (setId: number, questionId: number) =>
    api.delete(`/api/question-sets/admin/sets/${setId}/items/${questionId}`).then((r) => r.data),
  exportMd: (setId: number) =>
    api.get(`/api/question-sets/${setId}/export-md`).then((r) => r.data),
  importMd: (setId: number, content: string) =>
    api.post(`/api/question-sets/${setId}/import-md`, { content }).then((r) => r.data),
  uploadMd: (setId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/api/question-sets/${setId}/upload-md`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
};

// Plan
export const planApi = {
  today: (params?: { algo_count?: number; questions_count?: number }) =>
    api.get("/api/plan/today", { params }).then((r) => r.data),
  items: () => cached("plan:items", () => api.get("/api/plan/items").then((r) => r.data), 30_000),
  create: (data: object) =>
    api.post("/api/plan/items", data).then((r) => { bust("plan:items"); return r.data; }),
  update: (id: number, data: object) =>
    api.put(`/api/plan/items/${id}`, data).then((r) => { bust("plan:items"); return r.data; }),
  delete: (id: number) =>
    api.delete(`/api/plan/items/${id}`).then((r) => { bust("plan:items"); return r.data; }),
  reorder: (items: { id: number; order: number }[]) =>
    api.post("/api/plan/items/reorder", items).then((r) => { bust("plan:items"); return r.data; }),
  uploadResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/api/plan/resume", form).then((r) => { bust("plan:items"); return r.data; });
  },
};

// Dashboard
export const dashboardApi = {
  get: () => cached("dashboard", () => api.get("/api/dashboard").then((r) => r.data), 60_000),
};

// Notes
export const notesApi = {
  tree: () => cached("notes:tree", () => api.get("/api/notes").then((r) => r.data), 30_000),
  get: (id: number) => api.get(`/api/notes/${id}`).then((r) => r.data),
  create: (data: { title?: string; parent_id?: number; content?: string }) =>
    api.post("/api/notes", data).then((r) => { bust("notes:tree"); return r.data; }),
  update: (id: number, data: { title?: string; content?: string; order?: number }) =>
    api.put(`/api/notes/${id}`, data).then((r) => { bust("notes:tree"); return r.data; }),
  delete: (id: number) =>
    api.delete(`/api/notes/${id}`).then((r) => { bust("notes:tree"); return r.data; }),
  move: (id: number, data: { parent_id: number | null; order: number }) =>
    api.post(`/api/notes/${id}/move`, data).then((r) => { bust("notes:tree"); return r.data; }),
};
