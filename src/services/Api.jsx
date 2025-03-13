// src/services/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:2000';

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['x-auth-token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
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

export default api;

