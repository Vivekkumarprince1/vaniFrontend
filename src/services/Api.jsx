// src/services/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:2000';
const RETRY_DELAY = 1000; // Delay between retries in ms
const MAX_RETRIES = 3; // Maximum number of retries

// Shared state to track service status
const serviceState = {
  isBackendAvailable: true,
  connectionErrors: 0,
  lastConnectionAttempt: null,
  maintenanceMode: false
};

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000 // 10 second timeout
});

// Function to emit error events
const emitNetworkEvent = (eventType, details) => {
  const event = new CustomEvent('api-network-event', {
    detail: {
      type: eventType,
      timestamp: new Date().toISOString(),
      ...details
    }
  });
  window.dispatchEvent(event);
};

// Function to retry failed requests
const retryRequest = async (config, error) => {
  // Don't retry on specific response statuses
  if (error.response) {
    // Don't retry on 4xx client errors except 408 (timeout)
    if (error.response.status >= 400 && error.response.status < 500 && error.response.status !== 408) {
      return Promise.reject(error);
    }
  }

  // Track retry count
  const retryCount = config.retryCount || 0;
  if (retryCount >= MAX_RETRIES) {
    emitNetworkEvent('max-retries-exceeded', { url: config.url });
    return Promise.reject(error);
  }

  // Exponential backoff
  const delay = Math.min(RETRY_DELAY * Math.pow(2, retryCount), 10000);
  
  // Wait before retrying
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Update retry count
  const newConfig = { ...config, retryCount: retryCount + 1 };
  
  // Retry the request
  return api(newConfig);
};

// Check backend health
const checkBackendHealth = async () => {
  try {
    serviceState.lastConnectionAttempt = new Date();
    const response = await axios.get(`${API_URL}/status`, { timeout: 5000 });
    
    if (response.status === 200) {
      // If backend was previously unavailable, notify that it's back
      if (!serviceState.isBackendAvailable) {
        emitNetworkEvent('backend-restored', {});
      }
      
      serviceState.isBackendAvailable = true;
      serviceState.connectionErrors = 0;
      return true;
    }
    
    return false;
  } catch (error) {
    serviceState.isBackendAvailable = false;
    serviceState.connectionErrors++;
    
    if (serviceState.connectionErrors === 1) {
      emitNetworkEvent('backend-unavailable', { 
        error: error.message 
      });
    }
    
    return false;
  }
};

// Initial health check
checkBackendHealth();

// Schedule periodic health checks
setInterval(() => {
  // Only check if we've had a problem
  if (!serviceState.isBackendAvailable || serviceState.connectionErrors > 0) {
    checkBackendHealth();
  }
}, 30000);

// Add request interceptor to add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['x-auth-token'] = token;
    }
    
    // Add client timestamp to help debug time-related issues
    config.headers['x-client-timestamp'] = new Date().toISOString();
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle token expiration and errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle server errors (5xx) and network errors
    if (!error.response || error.response.status >= 500) {
      // Increment connection error count
      serviceState.connectionErrors++;
      
      // Mark backend as unavailable after consecutive errors
      if (serviceState.connectionErrors >= 3) {
        serviceState.isBackendAvailable = false;
        emitNetworkEvent('backend-unavailable', { 
          error: error.message,
          status: error.response?.status
        });
      }
      
      // Try to retry the request
      if (!error.config.retryCount || error.config.retryCount < MAX_RETRIES) {
        return retryRequest(error.config, error);
      }
    }
    
    // Handle authentication errors
    if (error.response && error.response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        emitNetworkEvent('auth-failed', {});
        window.location.href = '/login';
      }
    }
    
    // Handle maintenance mode
    if (error.response && error.response.status === 503) {
      serviceState.maintenanceMode = true;
      emitNetworkEvent('maintenance-mode', {});
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

// Translator API
export const translatorApi = {
  translate: (text, targetLanguage) => 
    api.post('/api/translator/translate', { text, targetLanguage })
};

// Export service state for components that need to check availability
export const getServiceState = () => ({ ...serviceState });

export default api;

