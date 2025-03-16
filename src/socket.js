import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_URL, {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_ATTEMPTS || '5'),
  reconnectionDelay: 1000,
  timeout: parseInt(import.meta.env.VITE_SOCKET_TIMEOUT || '60000'),
  autoConnect: false,
  path: '/socket.io/',
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

export default socket;
