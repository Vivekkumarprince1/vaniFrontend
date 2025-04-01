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
    this.maxAttempts = parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_ATTEMPTS || 15);
    this.useWebSocket = true; // Start with WebSockets enabled
    this.reconnectTimer = null;
    this.reconnecting = false;
    this.connectionStabilityTimer = null;
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

    // Clear any pending reconnect timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const transportOptions = this.useWebSocket 
      ? ['websocket', 'polling'] // Try websocket first, then fallback to polling
      : ['polling']; // Fallback to polling only if WebSockets fail
    
    const socketOptions = {
      auth: { token: this.token },
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: this.maxAttempts,
      reconnectionDelay: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_DELAY || 1000),
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5, // Add randomization for exponential backoff
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
      this.reconnecting = false;
      
      // Set up a timer to monitor connection stability
      if (this.connectionStabilityTimer) {
        clearInterval(this.connectionStabilityTimer);
      }
      
      this.connectionStabilityTimer = setInterval(() => {
        // Check if still connected, if not attempt to reconnect
        if (this.socket && !this.socket.connected && !this.reconnecting) {
          console.log("Detected disconnection, attempting to reconnect...");
          this.reconnecting = true;
          this.socket.connect();
        }
      }, 30000); // Check every 30 seconds
      
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
        
        // Wait before reconnecting with exponential backoff
        const reconnectDelay = Math.min(
          1000 * Math.pow(1.5, this.attemptCount), 
          60000
        ); // Max 1 minute delay
        
        console.log(`Reconnecting in ${reconnectDelay/1000} seconds...`);
        this.reconnectTimer = setTimeout(() => {
          this.reconnecting = true;
          this.connect();
        }, reconnectDelay);
      }
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}/${this.maxAttempts}`);
      this.reconnecting = true;
    });
    
    this.socket.on('reconnect', () => {
      console.log('Socket reconnected successfully');
      this.isConnected = true;
      this.reconnecting = false;
      this.triggerEvent('reconnect');
    });
    
    this.socket.on('reconnect_error', (err) => {
      console.error('Socket reconnection error:', err);
    });
    
    this.socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after max attempts');
      // Try one more time with different transport options
      this.useWebSocket = !this.useWebSocket;
      this.reconnectTimer = setTimeout(() => {
        console.log('Trying final reconnection with different transport');
        this.reconnecting = true;
        this.connect();
      }, 5000);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected. Reason: ${reason}`);
      this.isConnected = false;
      
      // Handle various disconnect reasons differently
      if (reason === 'io server disconnect') {
        // The server has forcefully disconnected the socket
        console.log('Server disconnected the socket, reconnecting...');
        this.reconnecting = true;
        this.socket.connect();
      } else if (reason === 'io client disconnect') {
        // The socket was manually disconnected, don't reconnect
        console.log('Socket manually disconnected, not reconnecting');
      } else {
        // Handle other disconnect reasons
        console.log(`Disconnected: ${reason}, letting socket.io handle reconnection`);
      }
      
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
    // Clear any timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.connectionStabilityTimer) {
      clearInterval(this.connectionStabilityTimer);
      this.connectionStabilityTimer = null;
    }
    
    if (this.socket) {
      console.log('Cleaning up socket connection');
      
      try {
        // Remove all listeners to prevent memory leaks
        this.socket.removeAllListeners();
        
        // Only attempt to remove engine listeners if the connection was established
        if (this.socket.io && this.socket.io.engine) {
          try {
            this.socket.io.removeAllListeners();
            this.socket.io.engine.removeAllListeners();
          } catch (err) {
            console.log('Could not remove engine listeners:', err.message);
          }
        }
        
        // Only disconnect if the socket exists and isn't already disconnecting
        if (this.socket.connected) {
          this.socket.disconnect();
        }
      } catch (err) {
        console.error('Error during socket cleanup:', err);
      }
      
      this.socket = null;
    }
    
    this.isConnected = false;
    this.reconnecting = false;
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