import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_URL, {
  path: '/socket.io/',
  transports: ['polling', 'websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: false,
  withCredentials: true,
  forceNew: true
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
  // Try to reconnect with polling if WebSocket fails
  if (socket.io.opts.transports.includes('websocket')) {
    socket.io.opts.transports = ['polling'];
    socket.connect();
  }
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Add connection success logging
socket.on('connect', () => {
  console.log('Socket connected successfully');
});

export default socket;
