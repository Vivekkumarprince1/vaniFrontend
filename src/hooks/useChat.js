import { useState, useEffect } from 'react';
import axios from 'axios';
import socketManager from '../utils/socketManager';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const useChat = (user) => {
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [users, setUsers] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [file, setFile] = useState(null);
    const [isTyping, setIsTyping] = useState(false);

    // Save chat state to local storage
    const saveChatState = (user, room) => {
        if (user) {
            localStorage.setItem('selectedUser', JSON.stringify(user));
            localStorage.removeItem('selectedRoom');
        } else if (room) {
            localStorage.setItem('selectedRoom', room);
            localStorage.removeItem('selectedUser');
        }
    };

    // Restore chat state from local storage
    const restoreChatState = () => {
        const savedUser = localStorage.getItem('selectedUser');
        const savedRoom = localStorage.getItem('selectedRoom');
        
        if (savedUser) {
            setSelectedUser(JSON.parse(savedUser));
        } else if (savedRoom) {
            setSelectedRoom(savedRoom);
        }
    };

    // Fetch users
    const fetchUsers = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/auth/users`);
            const filteredUsers = res.data.filter(u => u._id !== user?.id);
            const mappedUsers = filteredUsers.map(u => ({
                id: u._id,
                name: u.username,
                socketId: u.socketId,
                status: u.status === 'online' && u.socketId ? 'online' : 'offline',
                lastSeen: u.lastActive ? new Date(u.lastActive) : new Date(),
                avatar: u.username.charAt(0).toUpperCase(),
                preferredLanguage: u.preferredLanguage
            }));
            
            // Update selectedUser with latest socket ID if it exists in the new user list
            if (selectedUser) {
                const updatedSelectedUser = mappedUsers.find(u => u.id === selectedUser.id);
                if (updatedSelectedUser && updatedSelectedUser.socketId !== selectedUser.socketId) {
                    setSelectedUser(updatedSelectedUser);
                }
            }
            
            // Only update users state if there are actual changes to prevent unnecessary re-renders
            const hasChanges = JSON.stringify(mappedUsers) !== JSON.stringify(users);
            if (hasChanges) {
                setUsers(mappedUsers);
            }
            
            return mappedUsers;
        } catch (error) {
            console.error('Error fetching users:', error);
            // Return current users instead of throwing to prevent cascading errors
            return users;
        }
    };

    // Fetch rooms
    const fetchRooms = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/chat/rooms`);
            setRooms(res.data);
            return res.data;
        } catch (error) {
            console.error('Error fetching rooms:', error);
            throw error;
        }
    };

    // Fetch chat history
    const fetchChatHistory = async (userId = null, roomId = null) => {
        try {
            let url = `${API_URL}/api/chat/history`;
            if (userId) {
                url += `?userId=${userId}`;
            } else if (roomId) {
                url += `?roomId=${roomId}`;
            } else {
                return [];
            }

            const res = await axios.get(url);
            setMessages(res.data);
            return res.data;
        } catch (error) {
            console.error('Error fetching chat history:', error);
            throw error;
        }
    };

    // Handle file change
    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    // Send message
    const sendMessage = async () => {
        if (!message.trim() && !file) return;

        try {
            if (message.trim()) {
                if (!selectedUser && !selectedRoom) return;

                const messageData = {
                    message: message.trim(),
                    ...(selectedUser ? { receiverId: selectedUser.id } : { roomId: selectedRoom })
                };

                if (!socketManager.isSocketConnected()) {
                    alert('Connection lost. Please refresh the page.');
                    return;
                }

                socketManager.emit('sendMessage', messageData);
            }

            if (file) {
                const tempMsg = {
                    _id: `temp-${Date.now()}`,
                    sender: user.id,
                    content: `File: ${file.name}`,
                    timestamp: new Date().toISOString()
                };

                setMessages(prev => [...prev, tempMsg]);
            }

            setMessage('');
            setFile(null);
        } catch (error) {
            console.error('Error in sendMessage:', error);
            alert('Failed to send message. Please try again.');
        }
    };

    // Select user
    const selectUser = (user) => {
        setSelectedUser(user);
        setSelectedRoom(null);
        saveChatState(user, null);
    };

    // Select room
    const selectRoom = (room) => {
        setSelectedRoom(room);
        setSelectedUser(null);
        saveChatState(null, room);
        socketManager.emit('joinRoom', room);
    };

    // Create room
    const createRoom = async () => {
        const roomName = prompt('Enter room name:');
        if (!roomName) return;

        try {
            const res = await axios.post(`${API_URL}/api/chat/room`, { name: roomName });
            await fetchRooms();
            selectRoom(res.data._id);
        } catch (error) {
            console.error('Error creating room:', error);
        }
    };

    // Format time
    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Set up message listeners
    useEffect(() => {
        if (!socketManager.socket) return;

        const handleReceiveMessage = (message) => {
            setMessages(prevMessages => {
                const exists = prevMessages.some(msg => msg._id === message._id);
                if (exists) return prevMessages;
                return [...prevMessages, message];
            });
        };

        socketManager.on('receiveMessage', handleReceiveMessage);
        socketManager.on('userJoined', fetchUsers);
        socketManager.on('userLeft', fetchUsers);

        return () => {
            socketManager.off('receiveMessage', handleReceiveMessage);
            socketManager.off('userJoined');
            socketManager.off('userLeft');
        };
    }, [socketManager.socket]);

    // Fetch chat history when user or room is selected
    useEffect(() => {
        if (!user) return;
        
        if (selectedUser) {
            fetchChatHistory(selectedUser.id);
        } else if (selectedRoom) {
            fetchChatHistory(null, selectedRoom);
        }
    }, [selectedUser, selectedRoom, user]);

    // Set up periodic user refresh
    useEffect(() => {
        if (!user) return;

        fetchUsers();
        const interval = setInterval(fetchUsers, 10000);
        return () => clearInterval(interval);
    }, [user]);

    return {
        message,
        setMessage,
        messages,
        users,
        rooms,
        selectedUser,
        selectedRoom,
        file,
        isTyping,
        saveChatState,
        restoreChatState,
        fetchUsers,
        fetchRooms,
        fetchChatHistory,
        handleFileChange,
        sendMessage,
        selectUser,
        selectRoom,
        createRoom,
        formatTime
    };
};

export default useChat; 