import React, { useContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { TranslationProvider } from './contexts/TranslationContext';
// import ConnectionStatus from './components/ConnectionStatus';
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
      {/* <ConnectionStatus /> */}
    </>
  );
};

const App = () => {
  // Add audio initialization effect
  useEffect(() => {
    // Initialize audio context and unlock audio playback on first user interaction
    const initAudio = () => {
      try {
        console.log('Initializing audio context...');
        // Create a silent audio context
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContext();
        
        // Create a silent buffer
        const buffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
        
        // Resume the audio context
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
            console.log('Audio context resumed successfully');
          }).catch(err => {
            console.error('Failed to resume audio context:', err);
          });
        }
        
        console.log('Audio initialized with state:', audioContext.state);
        
        // Store the audio context in window for debugging
        window.appAudioContext = audioContext;
      } catch (error) {
        console.error('Error initializing audio:', error);
      }
    };
    
    // Add event listeners to unlock audio on user interaction
    const unlockAudio = () => {
      console.log('User interaction detected, unlocking audio...');
      if (window.appAudioContext && window.appAudioContext.state === 'suspended') {
        window.appAudioContext.resume();
      }
      // Remove the event listeners after first interaction
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    
    // Initialize audio
    initAudio();
    
    // Add event listeners for user interaction
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
    
    return () => {
      // Clean up event listeners
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      
      // Close audio context if it exists
      if (window.appAudioContext) {
        window.appAudioContext.close();
      }
    };
  }, []);

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