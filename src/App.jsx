import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import { AuthProvider } from './contexts/AuthContext';
import { TranslationProvider } from './contexts/TranslationContext';
import ConnectionStatus from './components/ConnectionStatus';
import './App.css';

const App = () => {
  return (
    <AuthProvider>
      <TranslationProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
          <ConnectionStatus />
        </Router>
      </TranslationProvider>
    </AuthProvider>
  );
};

export default App;
