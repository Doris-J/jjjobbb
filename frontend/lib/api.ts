import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
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
  me: () => api.get("/api/auth/me").then((r) => r.data),
  updateProfile: (data: object) => api.put("/api/auth/me", data).then((r) => r.data),
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
};

// Algorithm
export const algorithmApi = {
  getLists: () => api.get("/api/algorithm/lists").then((r) => r.data),
  selectList: (listId: number) =>
    api.post("/api/algorithm/lists/select", null, { params: { list_id: listId } }).then((r) => r.data),
  getProgress: () => api.get("/api/algorithm/lists/progress").then((r) => r.data),
  daily: () => api.get("/api/algorithm/daily").then((r) => r.data),
  record: (data: object) => api.post("/api/algorithm/record", data).then((r) => r.data),
  weakness: () => api.get("/api/algorithm/weakness").then((r) => r.data),
};

// Plan
export const planApi = {
  today: () => api.get("/api/plan/today").then((r) => r.data),
};

// Dashboard
export const dashboardApi = {
  get: () => api.get("/api/dashboard").then((r) => r.data),
};
