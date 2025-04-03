import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import Header from '../components/Header';
import ContactList from '../components/ContactList';
import MessageSection from '../components/MessageSection';
import socketManager from '../utils/socketManager';
import Loader from '../components/Loader';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Variable for socket instance
let socket;

const Dashboard = () => {
    const navigate = useNavigate();
    const { currentLanguage, changeLanguage } = useTranslation();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [peerConnection, setPeerConnection] = useState(null);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [rooms, setRooms] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [isCallActive, setIsCallActive] = useState(false);
    const [incomingCall, setIncomingCall] = useState(null);
    const [isOnline, setIsOnline] = useState(true);
    const [file, setFile] = useState(null);
    const [showSidebar, setShowSidebar] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [callInfo, setCallInfo] = useState(null);
    const [preCallLanguage, setPreCallLanguage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState("Authenticating...");

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    // Add function to save chat state
    const saveChatState = (user, room) => {
        if (user) {
            localStorage.setItem('selectedUser', JSON.stringify(user));
            localStorage.removeItem('selectedRoom');
        } else if (room) {
            localStorage.setItem('selectedRoom', room);
            localStorage.removeItem('selectedUser');
        }
    };

    // Add function to restore chat state
    const restoreChatState = () => {
        const savedUser = localStorage.getItem('selectedUser');
        const savedRoom = localStorage.getItem('selectedRoom');
        
        if (savedUser) {
            setSelectedUser(JSON.parse(savedUser));
        } else if (savedRoom) {
            setSelectedRoom(savedRoom);
        }
    };

    // Check authentication on component mount
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }

        // Set up axios with token
        axios.defaults.headers.common['x-auth-token'] = token;

        // Get user data
        const fetchUserData = async () => {
            try {
                setLoadingMessage("Fetching your profile...");
                const res = await axios.get(`${API_URL}/api/auth/me`);
                setUser(res.data);
                setIsAuthenticated(true);
                
                // After user data is loaded, restore chat state
                setLoadingMessage("Restoring your conversations...");
                restoreChatState();
                
                // Fetch users and rooms
                setLoadingMessage("Loading your contacts...");
                await fetchUsers();
                await fetchRooms();
                
                // If there's a selected user or room, fetch their messages
                if (selectedUser || selectedRoom) {
                    setLoadingMessage("Loading messages...");
                    await fetchChatHistory(selectedUser?.id, selectedRoom);
                }
                
                // We've loaded the essential data, can show UI now
                setLoading(false);
                
                // Initialize socket (but don't block UI on this)
                setLoadingMessage("Connecting to real-time service...");
                initializeSocket(token);
                
            } catch (err) {
                console.error('Error fetching user data:', err);
                localStorage.removeItem('token');
                navigate('/login');
            }
        };

        fetchUserData();
    }, [navigate]);
    
    // Separate socket initialization function
    const initializeSocket = (token) => {
        console.log('Initializing socket connection...');
        
        // Initialize socket using our manager
        socket = socketManager.initialize(token);

        // Set up event handlers
        socketManager.on('connect', () => {
            console.log('Socket connected with ID:', socket.id);
            setIsOnline(true);
            // Set up WebRTC after socket connection is established
            setupWebRTC();
        });

        socketManager.on('connect_error', (err) => {
            console.error('Socket connection error:', err);
            setIsOnline(false);
            
            if (err.message === 'Authentication error') {
                localStorage.removeItem('token');
                navigate('/login');
            }
        });
        
        // Rest of socket event handlers...
        socketManager.on('disconnect', (reason) => {
            console.log('Socket disconnected, reason:', reason);
            setIsOnline(false);
            // Clean up WebRTC on socket disconnect
            if (peerConnection) {
                peerConnection.close();
                setPeerConnection(null);
            }
        });

        socketManager.on('userStatusChanged', (data) => {
            console.log('User status changed:', data);
            setUsers(prevUsers =>
                prevUsers.map(u =>
                    u.id === data.userId
                        ? { ...u, socketId: data.socketId, status: data.status }
                        : u
                )
            );
        });
    };
    
    // Initialize socket and WebRTC when authenticated
    useEffect(() => {
        if (!isAuthenticated || !user) return;
        
        return () => {
            console.log('Cleaning up socket and WebRTC');
            // Remove all event listeners
            socketManager.off('connect');
            socketManager.off('connect_error');
            socketManager.off('disconnect');
            socketManager.off('userStatusChanged');
            
            // Clean up socket
            socketManager.cleanup();
            
            // Clean up WebRTC
            if (peerConnection) {
                peerConnection.close();
                setPeerConnection(null);
            }
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                setLocalStream(null);
            }
        };
    }, [isAuthenticated, user, navigate]);

    // Set up message listeners
    useEffect(() => {
        if (!socket) return;

        socketManager.on('receiveMessage', (message) => {
            setMessages(prevMessages => {
                const exists = prevMessages.some(msg => msg._id === message._id);
                if (exists) return prevMessages;
                return [...prevMessages, message];
            });
        });

        socketManager.on('userJoined', fetchUsers);
        socketManager.on('userLeft', fetchUsers);

        return () => {
            socketManager.off('receiveMessage');
            socketManager.off('userJoined');
            socketManager.off('userLeft');
        };
    }, [socket]);

    // Fetch chat history when user or room is selected
    useEffect(() => {
        if (!isAuthenticated) return;
        if (selectedUser) {
            fetchChatHistory(selectedUser.id);
        } else if (selectedRoom) {
            fetchChatHistory(null, selectedRoom);
        }
    }, [selectedUser, selectedRoom, isAuthenticated]);

    // WebRTC setup
    const setupWebRTC = async () => {
        try {
            if (peerConnection) {
                peerConnection.close();
            }

            // Create peer connection with ICE servers
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    // Add TURN server if available
                    // { 
                    //   urls: 'turn:your-turn-server.com:3478',
                    //   username: 'username',
                    //   credential: 'password'
                    // }
                ],
                iceCandidatePoolSize: 10,
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                // Enable mandatory encryption
                iceTransportPolicy: 'all',
                // Set reliability options
                sdpSemantics: 'unified-plan',
                // Add specific audio configuration
                rtcAudioJitterBufferMaxPackets: 500,
                rtcAudioJitterBufferFastAccelerate: true
            });

            // Create new MediaStream for remote tracks with specific audio constraints
            const newRemoteStream = new MediaStream();
            setRemoteStream(newRemoteStream);

            pc.ontrack = (event) => {
                console.log('Received remote track:', event.track.kind);
                
                // Only handle video tracks here, audio is handled separately
                if (event.track.kind === 'video') {
                    newRemoteStream.addTrack(event.track);
                }
                
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = newRemoteStream;
                }
            };

            // Add specific audio handling configuration
            pc.addTransceiver('audio', {
                direction: 'sendrecv',
                streams: [newRemoteStream]
            });

            // Connection state monitoring with reconnection
            pc.onconnectionstatechange = () => {
                console.log('Connection state:', pc.connectionState);

                if (pc.connectionState === 'connected') {
                    console.log('WebRTC connection established successfully');
                } else if (pc.connectionState === 'disconnected') {
                    console.log('WebRTC connection disconnected, attempting to recover...');
                    // Could implement reconnection logic here
                } else if (['failed', 'closed'].includes(pc.connectionState)) {
                    console.log('WebRTC connection failed or closed');
                    endCall();
                }
            };

            // ICE candidate handling
            pc.onicecandidate = (event) => {
                if (event.candidate && socket && selectedUser) {
                    console.log('Sending ICE candidate:', event.candidate);
                    socketManager.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: selectedUser.socketId
                    });
                }
            };

            // ICE gathering state monitoring
            pc.onicegatheringstatechange = () => {
                console.log('ICE gathering state:', pc.iceGatheringState);
            };

            // ICE connection state monitoring
            pc.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', pc.iceConnectionState);

                if (pc.iceConnectionState === 'failed') {
                    console.log('ICE connection failed, attempting to restart ICE...');
                    pc.restartIce();
                }
            };

            // Set peer connection state
            setPeerConnection(pc);

            // Set up socket event handlers for signaling
            if (socket) {
                // Remove existing listeners first
                socketManager.off('offer');
                socketManager.off('answer');
                socketManager.off('iceCandidate');

                // Handle incoming offers
                socketManager.on('offer', async ({ offer, from, type }) => {
                    console.log('Received offer from:', from, 'type:', type);
                    if (pc.signalingState !== 'stable') {
                        console.log('Cannot handle offer in state:', pc.signalingState);
                        return;
                    }
                    setIncomingCall({ from, offer, type });
                });

                // Handle incoming answers
                socketManager.on('answer', async ({ answer }) => {
                    console.log('Received answer, signaling state:', pc.signalingState);
                    try {
                        if (pc && pc.signalingState !== 'closed') {
                            await pc.setRemoteDescription(new RTCSessionDescription(answer));
                            console.log('Set remote description successfully');
                        }
                    } catch (error) {
                        console.error('Error setting remote description:', error);
                    }
                });

                // Handle incoming ICE candidates
                socketManager.on('iceCandidate', async ({ candidate }) => {
                    console.log('Received ICE candidate');
                    try {
                        if (pc && pc.remoteDescription) {
                            await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            console.log('Added ICE candidate successfully');
                        } else {
                            console.log('Skipping ICE candidate - no remote description');
                        }
                    } catch (error) {
                        console.error('Error adding ICE candidate:', error);
                    }
                });
            }

            return pc;
        } catch (error) {
            console.error('Error setting up WebRTC:', error);
            handleCallError(error);
            return null;
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
                    console.log('Updating selected user socket ID from', selectedUser.socketId, 'to', updatedSelectedUser.socketId);
                    setSelectedUser(updatedSelectedUser);
                }
            }
            
            setUsers(mappedUsers);
            return mappedUsers;
        } catch (error) {
            console.error('Error fetching users:', error);
            throw error;
        }
    };

    // Add an interval to refresh user statuses
    useEffect(() => {
        if (!isAuthenticated) return;

        // Initial fetch
        fetchUsers();

        // Set up periodic refresh with more frequent updates (every 10 seconds)
        const interval = setInterval(fetchUsers, 10000);

        return () => clearInterval(interval);
    }, [isAuthenticated, user]);

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

                if (!socket?.connected) {
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

    // Enhanced function to get user media with optimized constraints
    const getOptimizedUserMedia = async (type = 'video') => {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            },
            video: type === 'video' ? {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 24, max: 30 },
                facingMode: 'user'
            } : false
        };

        try {
            // Request media with constraints
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Configure audio tracks for better quality
            stream.getAudioTracks().forEach(track => {
                const settings = track.getSettings();
                console.log('Audio track settings:', settings);

                // Some browsers support additional constraints
                try {
                    if ('applyConstraints' in track) {
                        track.applyConstraints({
                            echoCancellation: true,
                            noiseSuppression: true
                        });
                    }
                } catch (constraintErr) {
                    console.warn('Could not apply additional audio constraints:', constraintErr);
                }
            });

            // Configure video tracks if present
            if (type === 'video') {
                stream.getVideoTracks().forEach(track => {
                    const settings = track.getSettings();
                    console.log('Video track settings:', settings);
                });
            }

            return stream;
        } catch (error) {
            console.error('Error getting user media:', error);
            throw error;
        }
    };

    // Start call
    const startCall = async (type = 'video') => {
        if (!selectedUser) {
            console.error('No user selected');
            alert('Please select a user to call');
            return;
        }
        
        // Refresh user list to get the latest socket ID
        try {
            const updatedUsers = await fetchUsers();
            const latestSelectedUser = updatedUsers.find(u => u.id === selectedUser.id);
            
            if (!latestSelectedUser) {
                console.error('Selected user not found in updated user list');
                alert('User not found. Please select another user.');
                return;
            }
            
            if (!latestSelectedUser.socketId) {
                console.error('No socket ID for selected user:', latestSelectedUser);
                alert('Cannot start call - user is not connected');
                return;
            }
            
            if (latestSelectedUser.socketId !== selectedUser.socketId) {
                console.log('Updating target socket ID from', selectedUser.socketId, 'to', latestSelectedUser.socketId);
                setSelectedUser(latestSelectedUser);
            }
            
            // Use the latest selectedUser for the call
            const targetUser = latestSelectedUser;

            // Clean up existing call first
            endCall();

            // Create RTCPeerConnection first
            const pc = await setupWebRTC();

            // Set up media stream 
            const stream = await navigator.mediaDevices.getUserMedia({
                video: type === 'video',
                audio: true
            });

            // Set local stream before adding tracks
            setLocalStream(stream);

            // Wait for state to update
            await new Promise(resolve => setTimeout(resolve, 100));

            // Add tracks to peer connection
            stream.getTracks().forEach(track => {
                console.log(`Adding ${track.kind} track to peer connection`);
                pc.addTrack(track, stream);
            });

            // Create and set local description
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });

            await pc.setLocalDescription(offer);

            // Send offer only after ICE gathering is complete or after a timeout
            await new Promise(resolve => {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkState, 500);
                    }
                };
                // Set a timeout to resolve anyway after 3 seconds
                const timeout = setTimeout(() => resolve(), 3000);
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                checkState();
            });

            // Create complete caller info object
            const callerInfo = {
                id: user.id,
                name: user.username,
                preferredLanguage: currentLanguage,
                status: 'online',
                avatar: user.username?.charAt(0).toUpperCase()
            };

            console.log('Sending call with caller info:', callerInfo);
            console.log('Target socket ID:', targetUser.socketId);

            // Add socket connection check
            if (!socketManager.isSocketConnected()) {
                console.error('Socket not connected, cannot make call');
                alert('Network connection issue. Please refresh and try again.');
                endCall();
                return;
            }

            // Send the offer
            socketManager.emit('offer', {
                targetId: targetUser.socketId,
                offer: pc.localDescription,
                type,
                callerInfo
            });

            // Register a listener for confirmation that the offer was received
            socketManager.on('callDelivered', (data) => {
                console.log('Call delivered confirmation received:', data);
            });

            setIsCallActive(true);

        } catch (error) {
            console.error('Error in startCall:', error);
            handleCallError(error);
            endCall();
        }
    };

    // Answer call
    const answerCall = async () => {
        if (!incomingCall || !callInfo) return;
        
        try {
            // Lock in the caller's info for the duration of the call
            console.log('Answering call with caller info:', callInfo);
            
            // Rest of answer call logic
            // Clean up any existing call
            endCall();

            // Create new peer connection
            const pc = await setupWebRTC();
            
            // Extract caller info from incoming call
            const callerInfo = incomingCall.callerInfo;
            
            // Store caller info as the selected user for the receiver
            if (callerInfo) {
                console.log("callerInfo:",callerInfo)
                setCallParticipant(callerInfo);
            }

            // Get local stream with user's camera and microphone
            const stream = await getOptimizedUserMedia(incomingCall.type);

            // Set local stream and connect to video element
            setLocalStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // Add all local tracks to peer connection for sending to caller
            stream.getTracks().forEach(track => {
                console.log(`Adding ${track.kind} track to peer connection`);
                pc.addTrack(track, stream);
            });

            // Set remote description first (important!)
            await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

            // Create and set local description
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Send answer after ICE gathering is complete or after a timeout
            await new Promise(resolve => {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkState, 500);
                    }
                };
                const timeout = setTimeout(() => resolve(), 3000);
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                checkState();
            });

            // Create receiver info to send with the answer
            const receiverInfo = {
                id: user.id,
                name: user.username,
                preferredLanguage: currentLanguage
            };

            // Send answer to caller with receiver info
            socketManager.emit('answer', {
                targetId: incomingCall.from,
                answer: pc.localDescription,
                receiverInfo
            });

            setIsCallActive(true);
            setIncomingCall(null);

        } catch (error) {
            console.error('Error in answerCall:', error);
            handleCallError(error);
            endCall();
        }
    };

    // End call
    const endCall = () => {
        console.log('Ending call');

        // First clean up tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log(`Stopping ${track.kind} track`);
                track.stop();
            });
            setLocalStream(null);
        }

        // Clean up peer connection
        if (peerConnection) {
            // Close the peer connection
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.onsignalingstatechange = null;
            peerConnection.onicegatheringstatechange = null;
            peerConnection.onnegotiationneeded = null;

            // Close the connection
            peerConnection.close();
            setPeerConnection(null);
        }

        // Clean up socket listeners if needed
        if (socket) {
            socketManager.off('offer');
            socketManager.off('answer');
            socketManager.off('iceCandidate');
        }

        // Reset video refs
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }

        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }

        setRemoteStream(null);
        setIsCallActive(false);
        setIncomingCall(null);
        setIsMuted(false);
        setIsCameraOff(false);

        console.log('Call ended and resources cleaned up');
        
        // Reset call info and restore language
        if (preCallLanguage) {
            changeLanguage(preCallLanguage);
        }
        setCallInfo(null);
        setPreCallLanguage(null);
    };

    // Handle call errors
    const handleCallError = (error) => {
        if (error.name === 'NotAllowedError') {
            alert('Please allow access to your camera and microphone to make calls.');
        } else if (error.name === 'NotFoundError') {
            alert('No camera or microphone found. Please check your devices.');
        } else {
            alert('Could not start call. Please check your camera/microphone permissions.');
        }
    };

    // Toggle mute
    const toggleMute = () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsMuted(!isMuted);
        }
    };

    // Toggle camera
    const toggleCamera = () => {
        if (localStream) {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsCameraOff(!isCameraOff);
        }
    };

    // Select user
    const selectUser = (user) => {
        setSelectedUser(user);
        setSelectedRoom(null);
        setShowSidebar(false);
        saveChatState(user, null);
    };

    // Select room
    const selectRoom = (room) => {
        setSelectedRoom(room);
        setSelectedUser(null);
        setShowSidebar(false);
        saveChatState(null, room);
        socketManager.emit('joinRoom', room);
    };

    // Create room
    const createRoom = async () => {
        const roomName = prompt('Enter room name:');
        if (!roomName) return;

        try {
            const res = await axios.post(`${API_URL}/api/chat/room`, { name: roomName });
            fetchRooms();
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

    // Add this effect to handle incoming calls
    useEffect(() => {
        if (!socket) return;

        // First, remove any existing listeners to prevent duplicates
        socketManager.off('incomingCall');
        socketManager.off('callEnded');

        const handleIncomingCall = (data) => {
            console.log('INCOMING CALL EVENT RECEIVED:', data);
            if (!data.caller) {
                console.error('Missing caller info in incoming call');
                return;
            }

            // Send confirmation of receipt back to server
            if (socket && data.from) {
                console.log('Sending receipt confirmation for call from:', data.from);
                socketManager.emit('incomingCallReceived', { 
                    from: data.from,
                    receiverId: socket.id,
                    timestamp: Date.now()
                });
            }

            // Try to resume audio context if needed
            try {
                const audioContext = window.AudioContext || window.webkitAudioContext;
                if (audioContext && audioContext.state === 'suspended') {
                    console.log('Attempting to resume audio context for incoming call');
                    audioContext.resume().then(() => {
                        console.log('Audio context resumed for incoming call');
                    });
                }
            } catch (err) {
                console.warn('Could not resume audio context:', err);
            }

            // Save current language
            setPreCallLanguage(currentLanguage);

            // Store complete caller info
            const callerInfo = {
                id: data.caller.id,
                name: data.caller.name || 'Unknown',
                socketId: data.from,
                preferredLanguage: data.caller.preferredLanguage,
                status: 'online',
                avatar: data.caller.avatar || data.caller.name?.charAt(0).toUpperCase()
            };

            console.log('Setting caller info:', callerInfo);
            setCallInfo(callerInfo);
            
            // Update selected user with caller info
            setSelectedUser(callerInfo);

            // Set incoming call with complete info - force UI update
            const callData = {
                offer: data.offer,
                type: data.type,
                from: data.from,
                caller: callerInfo
            };
            console.log('Setting incoming call data:', callData);
            setIncomingCall(null); // Clear first to ensure state change is detected
            setTimeout(() => setIncomingCall(callData), 50); // Set after a small delay
        };

        const handleCallEnded = () => {
            // Restore original language
            if (preCallLanguage) {
                changeLanguage(preCallLanguage);
            }
            setCallInfo(null);
            setPreCallLanguage(null);
        };

        // Register event handlers using named functions so they can be properly removed
        socketManager.on('incomingCall', handleIncomingCall);
        socketManager.on('callEnded', handleCallEnded);

        // Also monitor socket reconnection events
        socketManager.on('connect', () => {
            console.log('Socket reconnected - re-registering event handlers');
            // Force re-register handlers on reconnection
            socketManager.off('incomingCall');
            socketManager.off('callEnded');
            socketManager.on('incomingCall', handleIncomingCall);
            socketManager.on('callEnded', handleCallEnded);
        });

        return () => {
            socketManager.off('incomingCall');
            socketManager.off('callEnded');
            socketManager.off('connect');
        };
    }, [socket, currentLanguage, preCallLanguage]);

    // Update socket connection status
    useEffect(() => {
        if (socket) {
            setLoadingMessage("Connecting to chat service...");
        }
    }, [socket]);

    if (!isAuthenticated || loading) {
        return <Loader message={loadingMessage} />;
    }

    return (
        <div className="flex h-screen bg-[#efeae2] bg-[url('/chat-bg-pattern.png')]">
            {/* Sidebar overlay for mobile */}
            {showSidebar && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden backdrop-blur-sm"
                    onClick={() => setShowSidebar(false)}
                ></div>
            )}

            <Header
                user={user}
                toggleSidebar={() => setShowSidebar(!showSidebar)}
                handleLanguageChange={changeLanguage}
            />

            <div className="flex w-full h-full pt-16">
                <ContactList
                    users={users}
                    rooms={rooms}
                    selectedUser={selectedUser}
                    selectedRoom={selectedRoom}
                    selectUser={selectUser}
                    selectRoom={selectRoom}
                    createRoom={createRoom}
                    showSidebar={showSidebar}
                />

                <MessageSection
                    selectedUser={selectedUser}
                    selectedRoom={selectedRoom}
                    messages={messages}
                    message={message}
                    setMessage={setMessage}
                    sendMessage={sendMessage}
                    handleFileChange={handleFileChange}
                    isTyping={isTyping}
                    user={user}
                    startCall={startCall}
                    isCallActive={isCallActive}
                    localVideoRef={localVideoRef}
                    remoteVideoRef={remoteVideoRef}
                    toggleMute={toggleMute}
                    toggleCamera={toggleCamera}
                    endCall={endCall}
                    isMuted={isMuted}
                    isCameraOff={isCameraOff}
                    incomingCall={incomingCall}
                    answerCall={answerCall}
                    setIncomingCall={setIncomingCall}
                    formatTime={formatTime}
                    localStream={localStream}
                    remoteStream={remoteStream}
                    peerConnection={peerConnection}
                    socket={socket}
                />
            </div>
        </div>
    );
};

export default Dashboard;
