// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Checking authentication...");

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setLoading(false);
        return;
      }
      
      try {
        setLoadingMessage("Validating your session...");
        // Set default headers for all axios requests
        axios.defaults.headers.common['x-auth-token'] = token;
        
        // Fetch user data
        setLoadingMessage("Loading your profile...");
        const res = await axios.get(`${API_URL}/api/auth/me`);
        setUser(res.data);
        setIsAuthenticated(true);
      } catch (err) {
        console.error('Authentication error:', err);
        localStorage.removeItem('token');
      } finally {
        setLoadingMessage("Starting application...");
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  // Login user with mobile number
  const login = async (mobileNumber, password) => {
    try {
      setLoadingMessage("Logging in...");
      const res = await axios.post(`${API_URL}/api/auth/login`, { mobileNumber, password });
      localStorage.setItem('token', res.data.token);
      
      // Set token in axios headers
      axios.defaults.headers.common['x-auth-token'] = res.data.token;
      
      // Fetch user data
      setLoadingMessage("Loading your profile...");
      const userRes = await axios.get(`${API_URL}/api/auth/me`);
      setUser(userRes.data);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.error || 'Login failed' 
      };
    }
  };

  // Register user
  const register = async (userData) => {
    try {
      setLoadingMessage("Creating your account...");
      // Register the user - only username, mobile number, and password
      await axios.post(`${API_URL}/api/auth/register`, {
        username: userData.username,
        mobileNumber: userData.mobileNumber,
        password: userData.password
      });
      
      // Login after registration using mobile number
      setLoadingMessage("Logging you in...");
      return await login(userData.mobileNumber, userData.password);
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.error || 'Registration failed' 
      };
    }
  };

  // Logout user
  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['x-auth-token'];
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        loading,
        loadingMessage,
        setLoadingMessage,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
