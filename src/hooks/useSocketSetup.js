import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import socketManager from '../utils/socketManager';

const useSocketSetup = (token, onSocketReady) => {
    const navigate = useNavigate();
    const [isOnline, setIsOnline] = useState(false);
    const [socket, setSocket] = useState(null);

    // Initialize socket connection
    useEffect(() => {
        if (!token) return;
        
        // Use a ref for onSocketReady to avoid dependency changes
        const onSocketReadyRef = useRef(onSocketReady);
        
        // Update ref when prop changes
        useEffect(() => {
            onSocketReadyRef.current = onSocketReady;
        }, [onSocketReady]);
        
        const initSocket = () => {
            console.log('Initializing socket connection...');
            
            // Initialize socket using our manager
            const socketInstance = socketManager.initialize(token);
            setSocket(socketInstance);

            // Set up event handlers
            socketManager.on('connect', () => {
                console.log('Socket connected with ID:', socketInstance.id);
                setIsOnline(true);
                
                // Notify parent component that socket is ready
                if (onSocketReadyRef.current) {
                    onSocketReadyRef.current(socketInstance);
                }
            });

            socketManager.on('connect_error', (err) => {
                console.error('Socket connection error:', err);
                setIsOnline(false);
                
                if (err.message === 'Authentication error') {
                    localStorage.removeItem('token');
                    navigate('/login');
                }
            });
            
            // Handle disconnection
            socketManager.on('disconnect', (reason) => {
                console.log('Socket disconnected, reason:', reason);
                setIsOnline(false);
            });

            return socketInstance;
        };

        const socketInstance = initSocket();
        
        // Clean up function
        return () => {
            console.log('Cleaning up socket connection');
            socketManager.off('connect');
            socketManager.off('connect_error');
            socketManager.off('disconnect');
            socketManager.cleanup();
            setSocket(null);
        };
    }, [token, navigate]); // Remove onSocketReady from dependencies

    return { socket, isOnline };
};

export default useSocketSetup; 