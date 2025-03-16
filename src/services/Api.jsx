// src/services/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// Create axios instance with base URL and config
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  // Remove withCredentials since we're using token auth
  withCredentials: false
});

// Add request interceptor to add auth token to requests
api.interceptors.request.use(
  (config) => {
    // Add loading state if needed
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['x-auth-token'] = token;
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor with retry logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Retry the request if it failed due to network error
    if (error.message === 'Network Error' && !originalRequest._retry) {
      originalRequest._retry = true;
      return api(originalRequest);
    }

    // Handle authentication errors
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }

    // Handle server errors
    if (error.response?.status >= 500) {
      console.error('Server Error:', error.response.data);
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (credentials) => api.post('/api/auth/login', credentials),
  register: (userData) => api.post('/api/auth/register', userData),
  getMe: () => api.get('/api/auth/me'),
  getUsers: () => api.get('/api/auth/users')
};

// Chat API
export const chatApi = {
  getChatHistory: (userId, roomId) => {
    let url = '/api/chat/history';
    if (userId) url += `?userId=${userId}`;
    else if (roomId) url += `?roomId=${roomId}`;
    return api.get(url);
  },
  sendMessage: (messageData) => api.post('/api/chat/message', messageData),
  getRooms: () => api.get('/api/chat/rooms'),
  createRoom: (roomData) => api.post('/api/chat/room', roomData)
};

// Add health check endpoint
export const healthApi = {
  check: () => api.get('/api/health')
};

// Add connection status check
export const connectionApi = {
  checkConnection: async () => {
    try {
      await api.get('/api/health');
      return true;
    } catch (error) {
      console.error('Connection check failed:', error);
      return false;
    }
  }
};

export default api;

