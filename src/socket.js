import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_URL, {
  path: '/socket.io/',
  transports: ['polling'],
  reconnectionAttempts: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_ATTEMPTS || '5'),
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: parseInt(import.meta.env.VITE_SOCKET_TIMEOUT || '20000'),
  autoConnect: false,
  withCredentials: true
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Add connection success logging
socket.on('connect', () => {
  console.log('Socket connected successfully via', socket.io.engine.transport.name);
});

export default socket;
