import { io } from 'socket.io-client';

/**
 * Socket.IO Connection Manager
 * 
 * This utility provides a robust way to manage Socket.IO connections
 * with fallback mechanisms for Azure App Service WebSocket issues.
 */
class SocketManager {
  constructor() {
    this.socket = null;
    this.token = null;
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:2000';
    this.eventHandlers = new Map();
    this.isConnected = false;
    this.attemptCount = 0;
    this.maxAttempts = parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_ATTEMPTS || 10);
    this.useWebSocket = true; // Start with WebSockets enabled
  }

  /**
   * Initialize the socket connection
   * @param {string} token - Authentication token
   * @returns {Object} - The socket instance
   */
  initialize(token) {
    this.token = token;
    this.connect();
    return this.socket;
  }

  /**
   * Connect to the Socket.IO server
   */
  connect() {
    if (this.socket) {
      this.cleanup();
    }

    const transportOptions = this.useWebSocket 
      ? ['polling', 'websocket'] // Try polling first, then upgrade to websocket
      : ['polling']; // Fallback to polling only if WebSockets fail
    
    const socketOptions = {
      auth: { token: this.token },
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: this.maxAttempts,
      reconnectionDelay: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_DELAY || 2000),
      reconnectionDelayMax: 10000,
      timeout: parseInt(import.meta.env.VITE_SOCKET_TIMEOUT || 60000),
      transports: transportOptions,
      forceNew: true,
      autoConnect: true
    };

    console.log(`Connecting to socket with options:`, {
      url: this.baseUrl,
      ...socketOptions,
      auth: { token: '***' } // Don't log the actual token
    });

    this.socket = io(this.baseUrl, socketOptions);
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for the socket
   */
  setupEventListeners() {
    this.socket.on('connect', () => {
      console.log(`Socket connected with ID: ${this.socket.id}`);
      console.log(`Using transport: ${this.socket.io.engine.transport.name}`);
      this.isConnected = true;
      this.attemptCount = 0;
      this.triggerEvent('connect');
    });

    this.socket.io.engine.on('upgrade', () => {
      console.log(`Socket transport upgraded to: ${this.socket.io.engine.transport.name}`);
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      this.isConnected = false;
      this.attemptCount++;
      this.triggerEvent('connect_error', err);
      
      // If we're having WebSocket issues, retry with polling only
      if (
        this.useWebSocket && 
        (err.message?.includes('websocket') || this.attemptCount >= 3)
      ) {
        console.log('WebSocket connection failed, falling back to polling transport');
        this.useWebSocket = false;
        this.socket.disconnect();
        
        // Wait before reconnecting
        setTimeout(() => {
          this.connect();
        }, 1000);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected. Reason: ${reason}`);
      this.isConnected = false;
      this.triggerEvent('disconnect', reason);
    });

    // Add more built-in events as needed
  }

  /**
   * Register event handlers
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
      
      // Only register socket listener for custom events (not built-in ones we handle above)
      if (!['connect', 'connect_error', 'disconnect'].includes(event)) {
        this.socket?.on(event, (...args) => {
          this.triggerEvent(event, ...args);
        });
      }
    }
    
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Remove event handlers
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function (optional)
   */
  off(event, handler) {
    if (!this.eventHandlers.has(event)) return;
    
    if (handler) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.eventHandlers.delete(event);
        this.socket?.off(event);
      }
    } else {
      this.eventHandlers.delete(event);
      this.socket?.off(event);
    }
  }

  /**
   * Trigger event handlers
   * @param {string} event - Event name
   * @param {...any} args - Event arguments
   */
  triggerEvent(event, ...args) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Emit an event to the server
   * @param {string} event - Event name
   * @param {...any} args - Event arguments
   */
  emit(event, ...args) {
    if (!this.socket || !this.isConnected) {
      console.warn(`Cannot emit ${event}: Socket is not connected`);
      return false;
    }
    
    try {
      this.socket.emit(event, ...args);
      return true;
    } catch (error) {
      console.error(`Error emitting ${event}:`, error);
      return false;
    }
  }

  /**
   * Clean up the socket connection
   */
  cleanup() {
    if (this.socket) {
      console.log('Cleaning up socket connection');
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  /**
   * Get the current socket instance
   * @returns {Object|null} - The socket instance
   */
  getSocket() {
    return this.socket;
  }
  
  /**
   * Check if the socket is connected
   * @returns {boolean} - True if connected
   */
  isSocketConnected() {
    return this.isConnected && this.socket?.connected;
  }
}

// Create a singleton instance
const socketManager = new SocketManager();

export default socketManager; 