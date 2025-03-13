import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import Header from '../components/Header';
import ContactList from '../components/ContactList';
import MessageSection from '../components/MessageSection';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Create socket instance
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

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

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
                const res = await axios.get(`${API_URL}/api/auth/me`);
                setUser(res.data);
                setIsAuthenticated(true);
            } catch (err) {
                console.error('Error fetching user data:', err);
                localStorage.removeItem('token');
                navigate('/login');
            }
        };

        fetchUserData();
    }, [navigate]);

    // Initialize socket and WebRTC when authenticated
    useEffect(() => {
        if (!isAuthenticated || !user) return;

        const token = localStorage.getItem('token');
        socket = io(API_URL, {
            auth: { token },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            transports: ['websocket', 'polling']
        });

        // Socket connection events
        socket.on('connect', () => {
            console.log('Socket connected with ID:', socket.id);
            setIsOnline(true);
            fetchUsers();
            fetchRooms();
            // Set up WebRTC after socket connection is established
            setupWebRTC();
        });

        socket.on('userStatusChanged', (data) => {
            console.log('User status changed:', data);
            setUsers(prevUsers => 
                prevUsers.map(u => 
                    u.id === data.userId 
                        ? { ...u, socketId: data.socketId, status: data.status }
                        : u
                )
            );
        });

        socket.on('connect_error', (err) => {
            console.error('Socket connection error:', err);
            setIsOnline(false);
            if (err.message === 'Authentication error') {
                localStorage.removeItem('token');
                navigate('/login');
            }
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsOnline(false);
            // Clean up WebRTC on socket disconnect
            if (peerConnection) {
                peerConnection.close();
                setPeerConnection(null);
            }
        });

        return () => {
            console.log('Cleaning up socket and WebRTC');
            if (socket) {
                socket.off('connect');
                socket.off('connect_error');
                socket.off('disconnect');
                socket.disconnect();
            }
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

        socket.on('receiveMessage', (message) => {
            setMessages(prevMessages => {
                const exists = prevMessages.some(msg => msg._id === message._id);
                if (exists) return prevMessages;
                return [...prevMessages, message];
            });
        });

        socket.on('userJoined', fetchUsers);
        socket.on('userLeft', fetchUsers);

        return () => {
            socket.off('receiveMessage');
            socket.off('userJoined');
            socket.off('userLeft');
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

            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10,
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require'
            });

            // Handle track events immediately
            pc.ontrack = (event) => {
                console.log('Received remote track:', event.track.kind);
                if (event.streams?.[0]) {
                    console.log('Setting remote stream with tracks:', 
                        event.streams[0].getTracks().map(t => t.kind).join(', '));
                    setRemoteStream(event.streams[0]);
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('Connection state:', pc.connectionState);
                if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                    endCall();
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate && socket && selectedUser) {
                    console.log('Sending ICE candidate:', event.candidate);
                    socket.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: selectedUser.socketId
                    });
                }
            };

            // Set peer connection before setting up socket listeners
            setPeerConnection(pc);

            if (socket) {
                // Remove any existing listeners
                socket.off('offer');
                socket.off('answer');
                socket.off('iceCandidate');

                socket.on('offer', async ({ offer, from, type }) => {
                    console.log('Received offer from:', from, 'type:', type);
                    if (pc.signalingState !== 'stable') {
                        console.log('Cannot handle offer in state:', pc.signalingState);
                        return;
                    }
                    setIncomingCall({ from, offer, type });
                });

                socket.on('answer', async ({ answer }) => {
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

                socket.on('iceCandidate', async ({ candidate }) => {
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
                status: u.socketId ? 'online' : 'offline',
                lastSeen: u.lastSeen ? new Date(u.lastSeen) : new Date(),
                avatar: u.username.charAt(0).toUpperCase(),
                preferredLanguage: u.preferredLanguage
            }));
            console.log('Fetched users with socket IDs:', mappedUsers);
            setUsers(mappedUsers);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    // Fetch rooms
    const fetchRooms = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/chat/rooms`);
            setRooms(res.data);
        } catch (error) {
            console.error('Error fetching rooms:', error);
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
                return;
            }

            const res = await axios.get(url);
            setMessages(res.data);
        } catch (error) {
            console.error('Error fetching chat history:', error);
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

                socket.emit('sendMessage', messageData);
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

    // Start call
    const startCall = async (type = 'video') => {
        if (!selectedUser?.socketId) {
            console.error('No socket ID for selected user:', selectedUser);
            alert('Cannot start call - user not connected');
            return;
        }

        try {
            endCall(); // Clean up existing call

            // Create RTCPeerConnection first
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Set up media stream first
            const stream = await navigator.mediaDevices.getUserMedia({
                video: type === 'video',
                audio: true
            });

            // Set local stream immediately
            setLocalStream(stream);

            // Add tracks to peer connection
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // Handle remote stream
            pc.ontrack = (event) => {
                console.log('Received remote track:', event.track.kind);
                if (event.streams?.[0]) {
                    console.log('Setting remote stream:', event.streams[0].id);
                    setRemoteStream(event.streams[0]);
                }
            };

            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate && socket) {
                    console.log('Sending ICE candidate for track:', event.candidate.sdpMid);
                    socket.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: selectedUser.socketId
                    });
                }
            };

            // Create and set local description
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });
            
            await pc.setLocalDescription(offer);
            setPeerConnection(pc);

            // Send offer
            socket.emit('offer', {
                targetId: selectedUser.socketId,
                offer: pc.localDescription,
                type
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
        if (!incomingCall) return;

        try {
            // Clean up any existing call
            endCall();

            // Create new peer connection
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Set up peer connection handlers
            pc.onicecandidate = (event) => {
                if (event.candidate && socket) {
                    socket.emit('iceCandidate', {
                        candidate: event.candidate,
                        targetId: incomingCall.from
                    });
                }
            };

            pc.ontrack = (event) => {
                if (event.streams?.[0]) {
                    setRemoteStream(event.streams[0]);
                }
            };

            // Get local stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: incomingCall.type === 'video',
                audio: true
            });

            setLocalStream(stream);

            // Add tracks to peer connection
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // Set remote description first (important!)
            await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

            // Create and set local description
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Set peer connection and send answer
            setPeerConnection(pc);

            socket.emit('answer', {
                targetId: incomingCall.from,
                answer: pc.localDescription
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
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }

        if (peerConnection) {
            peerConnection.close();
            setPeerConnection(null);
        }

        setRemoteStream(null);
        setIsCallActive(false);
        setIncomingCall(null);
        setIsMuted(false);
        setIsCameraOff(false);
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
    };

    // Select room
    const selectRoom = (room) => {
        setSelectedRoom(room);
        setSelectedUser(null);
        setShowSidebar(false);
        socket.emit('joinRoom', room);
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

    if (!isAuthenticated) {
        return <div className="loading">Loading...</div>;
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
