import React, { useState, useEffect } from 'react';
import { getServiceState } from '../services/Api';

/**
 * ConnectionStatus component
 * Displays a notification when there are backend connectivity issues
 */
const ConnectionStatus = () => {
  const [connectionState, setConnectionState] = useState({
    isVisible: false,
    type: 'info', // 'info', 'warning', 'error'
    message: '',
    isBackendAvailable: true,
    isMaintenanceMode: false,
    retryCount: 0
  });

  // Set up event listeners for API connection events
  useEffect(() => {
    const handleNetworkEvent = (event) => {
      const { type, timestamp, error } = event.detail;
      
      switch (type) {
        case 'backend-unavailable':
          setConnectionState({
            isVisible: true,
            type: 'error',
            message: 'Connection to server lost. Attempting to reconnect...',
            isBackendAvailable: false,
            isMaintenanceMode: false,
            retryCount: 0
          });
          break;
          
        case 'backend-restored':
          setConnectionState(prev => ({
            isVisible: true,
            type: 'success',
            message: 'Connection restored!',
            isBackendAvailable: true,
            isMaintenanceMode: false,
            retryCount: 0
          }));
          
          // Hide the success message after 3 seconds
          setTimeout(() => {
            setConnectionState(prev => ({
              ...prev,
              isVisible: false
            }));
          }, 3000);
          break;
          
        case 'maintenance-mode':
          setConnectionState({
            isVisible: true,
            type: 'warning',
            message: 'Server is currently in maintenance mode. Please try again later.',
            isBackendAvailable: false,
            isMaintenanceMode: true,
            retryCount: 0
          });
          break;
          
        case 'max-retries-exceeded':
          setConnectionState(prev => ({
            ...prev,
            retryCount: prev.retryCount + 1,
            message: `Unable to connect to server. Retrying in background... (Attempt ${prev.retryCount + 1})`
          }));
          break;
          
        default:
          break;
      }
    };
    
    // Add event listener
    window.addEventListener('api-network-event', handleNetworkEvent);
    
    // Set up periodic check of service state
    const checkInterval = setInterval(() => {
      const state = getServiceState();
      
      // Show warning when backend is unavailable
      if (!state.isBackendAvailable && !connectionState.isVisible) {
        setConnectionState({
          isVisible: true,
          type: 'warning',
          message: 'Connection to server lost. Attempting to reconnect...',
          isBackendAvailable: false,
          isMaintenanceMode: state.maintenanceMode,
          retryCount: 0
        });
      }
      
      // Show success when backend becomes available again
      if (state.isBackendAvailable && !connectionState.isBackendAvailable) {
        setConnectionState({
          isVisible: true,
          type: 'success',
          message: 'Connection restored!',
          isBackendAvailable: true,
          isMaintenanceMode: false,
          retryCount: 0
        });
        
        // Hide the success message after 3 seconds
        setTimeout(() => {
          setConnectionState(prev => ({
            ...prev,
            isVisible: false
          }));
        }, 3000);
      }
    }, 5000);
    
    // Clean up
    return () => {
      window.removeEventListener('api-network-event', handleNetworkEvent);
      clearInterval(checkInterval);
    };
  }, [connectionState.isBackendAvailable, connectionState.isVisible]);
  
  // Manual retry connection
  const handleRetry = () => {
    const state = getServiceState();
    setConnectionState(prev => ({
      ...prev,
      message: 'Attempting to reconnect...',
    }));
    
    // Try to reload the page if it's been a while
    if (connectionState.retryCount > 3) {
      window.location.reload();
    }
  };
  
  // No need to render if not visible
  if (!connectionState.isVisible) {
    return null;
  }
  
  // Background color based on message type
  const getBgColor = () => {
    switch (connectionState.type) {
      case 'error': return 'bg-red-600';
      case 'warning': return 'bg-yellow-500';
      case 'success': return 'bg-green-600';
      default: return 'bg-blue-600';
    }
  };
  
  return (
    <div className={`fixed bottom-0 left-0 right-0 ${getBgColor()} text-white py-2 px-4 z-50 flex items-center justify-between`}>
      <div className="flex items-center">
        {connectionState.type === 'error' && (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
        {connectionState.type === 'warning' && (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
        {connectionState.type === 'success' && (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )}
        <p>{connectionState.message}</p>
      </div>
      
      {(connectionState.type === 'error' || connectionState.type === 'warning') && (
        <button
          onClick={handleRetry}
          className="bg-white text-gray-800 px-3 py-1 rounded text-sm hover:bg-gray-100"
        >
          Retry
        </button>
      )}
      
      {connectionState.type === 'success' && (
        <button
          onClick={() => setConnectionState(prev => ({ ...prev, isVisible: false }))}
          className="text-white hover:text-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ConnectionStatus; 