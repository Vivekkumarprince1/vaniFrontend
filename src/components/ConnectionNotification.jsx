import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const ConnectionNotification = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        await axios.get(`${API_URL}/api/health`, { 
          timeout: 5000,
          headers: {
            'Accept': 'application/json',
            'Origin': window.location.origin
          }
        });
        setIsConnected(true);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 3000);
      } catch (error) {
        console.error('Connection error:', error);
        setIsConnected(false);
        setShowNotification(true);
      }
    };

    checkConnection();
    const intervalId = setInterval(checkConnection, 30000);
    return () => clearInterval(intervalId);
  }, []);

  if (!showNotification) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg ${
      isConnected ? 'bg-green-500' : 'bg-red-500'
    }`}>
      <div className="flex items-center text-white">
        <div className={`w-3 h-3 rounded-full mr-2 ${
          isConnected ? 'bg-green-200' : 'bg-red-200'
        }`}></div>
        <p>
          {isConnected 
            ? 'Connected to backend' 
            : 'Disconnected from backend - retrying...'}
        </p>
      </div>
    </div>
  );
};

export default ConnectionNotification;