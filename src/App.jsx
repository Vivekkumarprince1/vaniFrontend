import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { TranslationProvider } from './contexts/TranslationContext';
import ConnectionStatus from './components/ConnectionStatus';
import Loader from './components/Loader';
import './App.css';

const AppRoutes = () => {
  // Get loading state from AuthContext
  const { loading, loadingMessage } = useContext(AuthContext);

  if (loading) {
    return <Loader message={loadingMessage} />;
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
      <ConnectionStatus />
    </>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <TranslationProvider>
        <Router>
          <AppRoutes />
        </Router>
      </TranslationProvider>
    </AuthProvider>
  );
};

export default App;
