import { useState, useEffect, useRef } from 'react';
import socketManager from '../utils/socketManager';
import { getRTCConfiguration, getMediaConstraints, waitForIceGathering } from '../utils/webrtcConfig';
import callSoundPlayer from '../utils/callSounds';

// Custom hook for WebRTC operations
const useWebRTC = (user, selectedUser) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callInfo, setCallInfo] = useState(null);
  
  // Use refs to avoid dependency issues
  const selectedUserRef = useRef(selectedUser);
  const userRef = useRef(user);
  
  // Update refs when props change, but don't use as dependencies in effects
  useEffect(() => {
    selectedUserRef.current = selectedUser;
    userRef.current = user;
  }, [selectedUser, user]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Setup WebRTC connection
  const setupWebRTC = async () => {
    try {
      if (peerConnection) {
        peerConnection.close();
      }

      // Create peer connection with ICE servers
      const pc = new RTCPeerConnection(getRTCConfiguration());

      // Create new MediaStream for remote tracks
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
        } else if (['failed', 'closed'].includes(pc.connectionState)) {
          console.log('WebRTC connection failed or closed');
          endCall();
        }
      };

      // ICE candidate handling
      pc.onicecandidate = (event) => {
        if (event.candidate && socketManager.socket && selectedUserRef.current) {
          console.log('Sending ICE candidate');
          socketManager.emit('iceCandidate', {
            candidate: event.candidate,
            targetId: selectedUserRef.current.socketId
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
      setupSignaling(pc);

      return pc;
    } catch (error) {
      console.error('Error setting up WebRTC:', error);
      handleCallError(error);
      return null;
    }
  };

  // Set up signaling events
  const setupSignaling = (pc) => {
    if (!socketManager.socket) return;
    
    // Remove existing listeners first
    socketManager.off('offer');
    socketManager.off('answer');
    socketManager.off('iceCandidate');
    socketManager.off('callDeclined');
    socketManager.off('callEnded');

    // Handle incoming offers
    socketManager.on('offer', async ({ offer, from, type, caller }) => {
      console.log('Received offer from:', from, 'type:', type);
      if (pc.signalingState !== 'stable' || !selectedUserRef.current) {
        console.log('Cannot handle offer in state:', pc.signalingState);
        return;
      }
      setIncomingCall({ from, offer, type, caller });
      
      // Play ringtone for incoming call - use setTimeout to ensure DOM is ready
      setTimeout(() => {
        try {
          console.log('Attempting to play ringtone...');
          callSoundPlayer.playRingtone();
          
          // Also try to trigger a user interaction if needed
          document.body.addEventListener('click', function unlockAudio() {
            callSoundPlayer.playRingtone();
            document.body.removeEventListener('click', unlockAudio);
          }, { once: true });
        } catch (e) {
          console.error('Error playing ringtone:', e);
        }
      }, 100);
    });

    // Handle incoming answers
    socketManager.on('answer', async ({ answer }) => {
      console.log('Received answer, signaling state:', pc.signalingState);
      try {
        // Stop ringback tone when call is answered
        callSoundPlayer.stopAll();
        
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

    // Add event handler for 'callDeclined'
    socketManager.on('callDeclined', () => {
      console.log('Call was declined');
      try {
        callSoundPlayer.stopAll();
        setTimeout(() => callSoundPlayer.playDisconnect(), 100);
        setIsCallActive(false);
      } catch (e) {
        console.error('Error handling declined call:', e);
      }
    });

    // Add event handler for 'callEnded'
    socketManager.on('callEnded', () => {
      console.log('Remote party ended the call');
      try {
        callSoundPlayer.stopAll();
        setTimeout(() => callSoundPlayer.playDisconnect(), 100);
        endCall();
      } catch (e) {
        console.error('Error handling ended call:', e);
      }
    });
  };

  // Get optimized user media
  const getOptimizedUserMedia = async (type = 'video') => {
    try {
      // Request media with constraints
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(type));

      // Configure audio tracks for better quality
      stream.getAudioTracks().forEach(track => {
        console.log('Audio track settings:', track.getSettings());

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
          console.log('Video track settings:', track.getSettings());
        });
      }

      return stream;
    } catch (error) {
      console.error('Error getting user media:', error);
      throw error;
    }
  };

  // Start call
  const startCall = async (type = 'video', currentLanguage) => {
    if (!selectedUserRef.current) {
      console.error('No user selected');
      alert('Please select a user to call');
      return;
    }
    
    // Refresh user list to get the latest socket ID (handled by caller)
    try {
      // Clean up existing call first
      endCall();

      // Create RTCPeerConnection first
      const pc = await setupWebRTC();

      // Set up media stream 
      const stream = await getOptimizedUserMedia(type);

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
      await waitForIceGathering(pc);

      // Create complete caller info object
      const callerInfo = {
        id: userRef.current.id,
        name: userRef.current.username,
        preferredLanguage: currentLanguage,
        status: 'online',
        avatar: userRef.current.username?.charAt(0).toUpperCase()
      };

      // Add socket connection check
      if (!socketManager.isSocketConnected()) {
        console.error('Socket not connected, cannot make call');
        alert('Network connection issue. Please refresh and try again.');
        endCall();
        return;
      }

      // Send the offer
      socketManager.emit('offer', {
        targetId: selectedUserRef.current.socketId,
        offer: pc.localDescription,
        type,
        callerInfo
      });

      // Play ringback tone for caller with a small delay to ensure UI is updated
      setTimeout(() => {
        try {
          console.log('Starting ringback tone...');
          callSoundPlayer.playRingback();
          
          // Also try to trigger a user interaction if needed
          document.body.addEventListener('click', function unlockAudio() {
            callSoundPlayer.playRingback();
            document.body.removeEventListener('click', unlockAudio);
          }, { once: true });
        } catch (e) {
          console.error('Error playing ringback:', e);
        }
      }, 100);

      setIsCallActive(true);

    } catch (error) {
      console.error('Error in startCall:', error);
      handleCallError(error);
      endCall();
    }
  };

  // Answer call
  const answerCall = async (currentLanguage) => {
    if (!incomingCall || !callInfo) return;
    
    // Stop ringtone when answering - Add multiple attempts with delay
    try {
      console.log('Stopping ringtone in answerCall - first attempt');
      callSoundPlayer.stopAll();
      
      // Secondary attempt after a short delay
      setTimeout(() => {
        try {
          console.log('Secondary ringtone stop attempt in answerCall');
          callSoundPlayer.stopAll();
        } catch (e) {
          console.error('Error in secondary ringtone stop:', e);
        }
      }, 300);
    } catch (e) {
      console.error('Error stopping ringtone in answerCall:', e);
    }
    
    try {
      // Lock in the caller's info for the duration of the call
      console.log('Answering call with caller info:', callInfo);
      
      // Clean up any existing call
      endCall(false); // Pass false to avoid playing disconnect sound when answering

      // Create new peer connection
      const pc = await setupWebRTC();

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

      // Send answer after ICE gathering is complete
      await waitForIceGathering(pc);

      // Create receiver info to send with the answer
      const receiverInfo = {
        id: userRef.current.id,
        name: userRef.current.username,
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
  const endCall = (playSound = true) => {
    console.log('Ending call');
    
    // Play disconnect sound and stop any other sounds if requested
    try {
      callSoundPlayer.stopAll();
      
      if (playSound) {
        setTimeout(() => {
          try {
            callSoundPlayer.playDisconnect();
          } catch (e) {
            console.error('Error playing disconnect sound:', e);
          }
        }, 100);
      }
    } catch (e) {
      console.error('Error handling sounds during call end:', e);
    }

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
      // Clear callbacks
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
    if (socketManager.socket) {
      socketManager.off('offer');
      socketManager.off('answer');
      socketManager.off('iceCandidate');
      socketManager.off('callDeclined');
      socketManager.off('callEnded');
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
    setCallInfo(null);

    console.log('Call ended and resources cleaned up');
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

  // Set caller information
  const setCallerInfo = (info) => {
    setCallInfo(info);
  };

  // Update or add the setIncomingCall function
  const setIncomingCallHandler = (call) => {
    // If call is null, stop sounds (call was declined)
    if (call === null && incomingCall !== null) {
      callSoundPlayer.stopAll();
    }
    setIncomingCall(call);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      endCall();
      
      // Clean up call sounds
      callSoundPlayer.cleanup();
    };
  }, []);

  return {
    localStream,
    remoteStream,
    peerConnection,
    isCallActive,
    incomingCall,
    isMuted,
    isCameraOff,
    callInfo,
    localVideoRef,
    remoteVideoRef,
    setupWebRTC,
    startCall,
    answerCall,
    endCall,
    toggleMute,
    toggleCamera,
    setCallerInfo,
    setIncomingCall: setIncomingCallHandler
  };
};

export default useWebRTC; 