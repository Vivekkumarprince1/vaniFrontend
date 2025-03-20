import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_URL, {
  path: '/socket.io/',
  transports: ['polling'], // Start with polling only for Vercel
  reconnectionAttempts: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_ATTEMPTS || '5'),
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: parseInt(import.meta.env.VITE_SOCKET_TIMEOUT || '20000'),
  autoConnect: false,
  withCredentials: true,
  forceNew: true
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
  // Don't try to switch to websocket on Vercel
  if (window.location.hostname === 'localhost' && socket.io.opts.transports.includes('polling') && !socket.io.opts.transports.includes('websocket')) {
    console.log('Trying to upgrade to WebSocket on local environment');
    socket.io.opts.transports = ['polling', 'websocket'];
    socket.connect();
  }
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Add connection success logging
socket.on('connect', () => {
  console.log('Socket connected successfully via', socket.io.engine.transport.name);
});

export default socket;
