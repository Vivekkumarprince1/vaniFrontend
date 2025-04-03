import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import AudioMixer from '../services/AudioMixer';

const VideoCall = ({
  localStream,
  remoteStream,
  localVideoRef,
  remoteVideoRef,
  toggleMute,
  toggleCamera,
  endCall,
  isMuted,
  isCameraOff,
  peerConnection,
  socket,
  selectedUser
}) => {
  const { currentLanguage } = useTranslation();
  const [transcribedText, setTranscribedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [localTranscript, setLocalTranscript] = useState('');
  const [remoteTranscript, setRemoteTranscript] = useState('');
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const lastProcessedTime = useRef(0);
  const PROCESS_INTERVAL = 1000; 
  
  // Create a reusable audio mixer instance
  const audioMixerRef = useRef(null);

  // Add new state for translated remote audio
  const [isRemoteAudioProcessing, setIsRemoteAudioProcessing] = useState(false);
  const remoteAudioProcessorRef = useRef(null);
  const remoteSourceNodeRef = useRef(null);
  
  // Add state to store call participant info
  const [callParticipant, setCallParticipant] = useState(null);
  
  // Helper function to get the correct target user (either selectedUser or callParticipant)
  const getTargetUser = () => {
    // If we have call participant info, use that
    if (callParticipant) {
      return callParticipant;
    }
    // Otherwise fall back to selectedUser
    return selectedUser;
  };

  // Add this useEffect to request participant info when component mounts
  useEffect(() => {
    if (!socket?.connected || !selectedUser?.id) return;
    
    // Request participant info from the server
    console.log('Requesting participant info for user:', selectedUser.id);
    socket.emit('getCallParticipantInfo', { userId: selectedUser.id });
    
  }, [socket, selectedUser]);

  useEffect(() => {
    if (!localStream || !peerConnection || !remoteStream) return;

    // Initialize audio processing for both local and remote streams
    setupAudioProcessing();
    setupRemoteAudioProcessing();

    return () => {
      cleanupAudioProcessing();
      cleanupRemoteAudioProcessing();
    };
  }, [localStream, peerConnection, remoteStream, callParticipant]);

  const setupAudioProcessing = async () => {
    try {
      // Initialize audio context regardless of user info
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 16000});
      const audioTrack = localStream.getAudioTracks()[0];
      
      if (!audioTrack) {
        console.error('No audio track found');
        return;
      }
      
      // Check socket connection
      if (!socket?.connected) {
        console.warn('Socket not connected, audio processing may not work properly');
      }
      
      // Log target user info for debugging
      const targetUser = getTargetUser();
      console.log('Setting up audio processing with target user:', targetUser);

      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(new MediaStream([audioTrack]));
      
      // Fallback directly to ScriptProcessor as it's more reliable
      setupScriptProcessor();
    } catch (error) {
      console.error('Audio processing setup failed:', error);
    }
  };

  const setupScriptProcessor = () => {
    // Use a larger buffer size for more reliable processing
    processorNodeRef.current = audioContextRef.current.createScriptProcessor(8192, 1, 1);
    let audioBuffer = new Float32Array();
    let lastProcessingTime = Date.now();
    let isProcessing = false;
    
    processorNodeRef.current.onaudioprocess = (e) => {
      if (isMuted || isProcessing) return;
  
      const inputData = e.inputBuffer.getChannelData(0);
      const newBuffer = new Float32Array(audioBuffer.length + inputData.length);
      newBuffer.set(audioBuffer);
      newBuffer.set(inputData, audioBuffer.length);
      audioBuffer = newBuffer;
      
      const now = Date.now();
      // Process every 3 seconds for better recognition
      if (now - lastProcessingTime >= 3000 && audioBuffer.length > 0) {
        // Check for actual speech with a lower threshold
        const hasSound = audioBuffer.some(sample => Math.abs(sample) > 0.005);
        if (hasSound) {
          isProcessing = true;
          sendAudioForTranslation(audioBuffer)
            .finally(() => {
              isProcessing = false;
              // Clear the buffer after processing
              audioBuffer = new Float32Array();
              lastProcessingTime = now;
            });
        } else {
          // Clear the buffer even if no sound was detected
          audioBuffer = new Float32Array();
          lastProcessingTime = now;
        }
      }
    };
  
    sourceNodeRef.current.connect(processorNodeRef.current);
    processorNodeRef.current.connect(audioContextRef.current.destination);
  };

  const setupRemoteAudioProcessing = async () => {
    try {
      if (!socket?.connected || !currentLanguage) {
        console.warn('Socket not connected or missing current language');
        return;
      }

      const remoteAudioTrack = remoteStream.getAudioTracks()[0];
      if (!remoteAudioTrack) {
        console.error('No remote audio track found');
        return;
      }

      remoteSourceNodeRef.current = audioContextRef.current.createMediaStreamSource(new MediaStream([remoteAudioTrack]));
      setupRemoteScriptProcessor();
    } catch (error) {
      console.error('Remote audio processing setup failed:', error);
    }
  };

  const setupRemoteScriptProcessor = () => {
    remoteAudioProcessorRef.current = audioContextRef.current.createScriptProcessor(8192, 1, 1);
    let remoteAudioBuffer = new Float32Array();
    let lastRemoteProcessingTime = Date.now();
    
    remoteAudioProcessorRef.current.onaudioprocess = (e) => {
      if (isRemoteAudioProcessing) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const newBuffer = new Float32Array(remoteAudioBuffer.length + inputData.length);
      newBuffer.set(remoteAudioBuffer);
      newBuffer.set(inputData, remoteAudioBuffer.length);
      remoteAudioBuffer = newBuffer;
      
      const now = Date.now();
      if (now - lastRemoteProcessingTime >= 3000 && remoteAudioBuffer.length > 0) {
        const hasSound = remoteAudioBuffer.some(sample => Math.abs(sample) > 0.005);
        if (hasSound) {
          setIsRemoteAudioProcessing(true);
          sendRemoteAudioForTranslation(remoteAudioBuffer)
            .finally(() => {
              setIsRemoteAudioProcessing(false);
              remoteAudioBuffer = new Float32Array();
              lastRemoteProcessingTime = now;
            });
        } else {
          remoteAudioBuffer = new Float32Array();
          lastRemoteProcessingTime = now;
        }
      }
    };

    remoteSourceNodeRef.current.connect(remoteAudioProcessorRef.current);
    remoteAudioProcessorRef.current.connect(audioContextRef.current.destination);
  };

  const sendAudioForTranslation = async (audioData) => {
    try {
      // Check socket connection before proceeding
      if (!socket?.connected) {
        console.warn('Socket not connected, cannot send audio for translation');
        return;
      }
      
      const targetUser = getTargetUser();
      // Use fallback values if target user info is missing
      const targetLanguage = targetUser?.preferredLanguage || 'en';
      const targetUserId = targetUser?.id || 'unknown';
      
      console.log('Target user for translation:', targetUser);
      
      // Convert to 16-bit PCM
      const pcmData = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Create WAV buffer
      const wavBuffer = createWavBuffer(pcmData);
      
      // Convert to base64 safely
      let base64Audio = '';
      try {
        // Handle large arrays by chunking
        const chunks = [];
        const chunkSize = 1024;
        for (let i = 0; i < wavBuffer.length; i += chunkSize) {
          chunks.push(String.fromCharCode.apply(null, wavBuffer.subarray(i, i + chunkSize)));
        }
        base64Audio = btoa(chunks.join(''));
      } catch (e) {
        console.error('Base64 conversion error:', e);
        return;
      }
      
      console.log('Sending audio for translation:', {
        sourceLanguage: currentLanguage,
        targetLanguage: targetLanguage,
        audioLength: wavBuffer.length
      });
      
      socket.emit('translateAudio', {
        audio: base64Audio,
        sourceLanguage: currentLanguage,
        targetLanguage: targetLanguage,
        userId: targetUserId,
        sampleRate: 16000,
        encoding: 'WAV'
      });
    } catch (error) {
      console.error('Error sending audio for translation:', error);
    }
  };

  const sendRemoteAudioForTranslation = async (audioData) => {
    try {
      if (!socket?.connected) return;
      
      const targetUser = getTargetUser();
      // Use fallback values if target user info is missing
      const sourceLanguage = targetUser?.preferredLanguage || 'en';
      const targetUserId = targetUser?.id || 'unknown';
      
      const pcmData = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      const wavBuffer = createWavBuffer(pcmData);
      const base64Audio = await convertToBase64(wavBuffer);
      
      socket.emit('translateRemoteAudio', {
        audio: base64Audio,
        sourceLanguage: sourceLanguage,
        targetLanguage: currentLanguage,
        userId: targetUserId,
        sampleRate: 16000,
        encoding: 'WAV'
      });
    } catch (error) {
      console.error('Error sending remote audio for translation:', error);
    }
  };

  const createWavBuffer = (pcmData) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const dataLength = pcmData.length * 2; // 16-bit = 2 bytes per sample

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, 16000, true); // Sample rate
    view.setUint32(28, 32000, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Combine header and PCM data
    const blob = new Uint8Array(header.byteLength + dataLength);
    blob.set(new Uint8Array(header), 0);
    blob.set(new Uint8Array(pcmData.buffer), header.byteLength);
    
    return blob;
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const convertToBase64 = async (buffer) => {
    const chunks = [];
    const chunkSize = 1024;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, buffer.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(''));
  };

  const cleanupAudioProcessing = () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const cleanupRemoteAudioProcessing = () => {
    if (remoteAudioProcessorRef.current) {
      remoteAudioProcessorRef.current.disconnect();
      remoteAudioProcessorRef.current = null;
    }
    if (remoteSourceNodeRef.current) {
      remoteSourceNodeRef.current.disconnect();
      remoteSourceNodeRef.current = null;
    }
  };

  // Single useEffect for video streams
  useEffect(() => {
    const setupVideo = async (ref, stream, isLocal) => {
        if (!ref.current || !stream) {
            console.log(`${isLocal ? 'Local' : 'Remote'} video ref or stream missing`);
            return;
        }

        try {
            // Log media information
            console.log(`Setting up ${isLocal ? 'local' : 'remote'} video with tracks:`,
                stream.getTracks().map(t => ({
                    kind: t.kind,
                    enabled: t.enabled,
                    id: t.id,
                    readyState: t.readyState
                }))
            );

            // Reset video element
            ref.current.srcObject = null;
            
            // Set new stream
            ref.current.srcObject = stream;
            ref.current.muted = isLocal; // Only mute local video
            ref.current.playsInline = true;
            ref.current.autoplay = true; // Ensure autoplay is enabled
            
            // Ensure video elements are properly sized
            ref.current.style.width = '100%';
            ref.current.style.height = '100%';
            ref.current.style.objectFit = 'cover';

            // Play with auto-play fallback
            try {
                await ref.current.play();
                console.log(`${isLocal ? 'Local' : 'Remote'} video playing`);
            } catch (playError) {
                if (playError.name === 'NotAllowedError') {
                    console.log('Auto-play prevented, waiting for user interaction');
                    const playOnClick = async () => {
                        try {
                            await ref.current.play();
                            ref.current.removeEventListener('click', playOnClick);
                        } catch (err) {
                            console.error('Play on click failed:', err);
                        }
                    };
                    ref.current.addEventListener('click', playOnClick);
                }
            }

        } catch (err) {
            console.error(`Error setting up ${isLocal ? 'local' : 'remote'} video:`, err);
        }
    };

    if (localStream) {
        setupVideo(localVideoRef, localStream, true);
    }
    
    if (remoteStream) {
        // Log remote stream details to debug
        console.log('Remote stream received in VideoCall component:', {
            hasStream: !!remoteStream,
            trackCount: remoteStream.getTracks().length,
            tracks: remoteStream.getTracks().map(t => t.kind)
        });
        setupVideo(remoteVideoRef, remoteStream, false);
    }

    return () => {
        // Cleanup function
        const cleanupVideo = (ref) => {
            if (ref.current) {
                ref.current.srcObject = null;
                ref.current.removeAttribute('src');
                ref.current.load();
            }
        };
        cleanupVideo(localVideoRef);
        cleanupVideo(remoteVideoRef);
    };
}, [localStream, remoteStream]);

  // Initialize the audio mixer in a useEffect
  useEffect(() => {
    // Initialize the AudioMixer once
    if (!audioMixerRef.current) {
      audioMixerRef.current = new AudioMixer();
      console.log('AudioMixer instance created');
      
      // Notify the server that our audio system is ready
      if (socket?.connected) {
        socket.emit('audioSystemReady', { ready: true });
        console.log('Notified server that audio system is ready');
      }
    }
    
    return () => {
      // Clean up the AudioMixer when component unmounts
      if (audioMixerRef.current) {
        audioMixerRef.current.close();
        audioMixerRef.current = null;
        console.log('AudioMixer instance destroyed');
      }
    };
  }, [socket]);

  // Update the handleTranslatedAudio function with better debugging
  const handleTranslatedAudio = async (data) => {
    // Check if data has the expected structure
    if (!data) {
      console.error('Received empty data in handleTranslatedAudio');
      return;
    }

    console.log('⭐ RECEIVED translatedAudio event:', {
      hasText: !!data.text,
      hasAudio: !!data.audio,
      audioLength: data.audio ? data.audio.length : 0,
      timestamp: data.timestamp,
      requestId: data.requestId
    });

    // Extract text and audio from the data
    const { text, audio } = data;
    
    if (text) {
      setTranscribedText(text.original || '');
      setTranslatedText(text.translated || '');
      console.log('📝 Text received:', { 
        original: text.original?.slice(0, 20) + '...',
        translated: text.translated?.slice(0, 20) + '...'
      });
    }

    if (audio) {
      try {
        console.log('🔊 Received translated audio data, length:', audio.length, 'type:', typeof audio);
        console.log('Audio data sample:', audio.substring(0, 20) + '...');
        
        // Additional validation for audio data
        if (typeof audio !== 'string') {
          console.error('Unexpected audio data type:', typeof audio);
          throw new Error('Unexpected audio data type');
        }
        
        if (audio.length < 100) {
          console.error('Audio data too short:', audio.length);
          throw new Error('Audio data too short');
        }
        
        // Try decoding a small snippet to check if it's valid base64
        try {
          const testDecode = atob(audio.substring(0, 10));
          console.log('Base64 test decode successful');
        } catch (e) {
          console.error('Failed to decode audio base64:', e);
          throw new Error('Invalid base64 encoding');
        }
        
        // Create new mixer if it doesn't exist yet
        if (!audioMixerRef.current) {
          audioMixerRef.current = new AudioMixer();
          console.log('Created new AudioMixer instance for translation');
        }
        
        // Show UI notification
        const audioNotification = document.createElement('div');
        audioNotification.textContent = '🔊 Incoming audio...';
        audioNotification.style.position = 'fixed';
        audioNotification.style.top = '20px';
        audioNotification.style.left = '50%';
        audioNotification.style.transform = 'translateX(-50%)';
        audioNotification.style.backgroundColor = 'rgba(0,0,0,0.7)';
        audioNotification.style.color = 'white';
        audioNotification.style.padding = '10px 20px';
        audioNotification.style.borderRadius = '20px';
        audioNotification.style.zIndex = '9999';
        document.body.appendChild(audioNotification);
        
        // Add a basic user interaction to help unlock audio playback
        window.addEventListener('click', function audioUnlockHandler() {
          console.log('User interaction detected, audio should be unlocked now');
          window.removeEventListener('click', audioUnlockHandler);
        }, { once: true });
        
        // Play a short beep before the actual audio to ensure audio system is active
        const beepContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = beepContext.createOscillator();
        const gainNode = beepContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(beepContext.destination);
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.05; // Very quiet beep
        oscillator.start();
        oscillator.stop(beepContext.currentTime + 0.05); // Very short beep
        
        // Wait a moment for the beep to finish
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try to play the translated audio using all available methods
        try {
          console.log('Attempting primary method: AudioMixer.playTranslatedAudio');
          await audioMixerRef.current.playTranslatedAudio(audio);
          console.log('✅ Primary audio playback successful');
        } catch (playError) {
          console.error('❌ Primary audio playback failed:', playError);
          
          try {
            // Try audio element as fallback
            console.log('Attempting fallback method 1: HTML Audio element');
            const audioElement = new Audio(`data:audio/wav;base64,${audio}`);
            audioElement.addEventListener('error', (e) => {
              console.error('Audio element error:', e);
            });
            await audioElement.play();
            console.log('✅ Fallback method 1 successful');
          } catch (fallback1Error) {
            console.error('❌ Fallback method 1 failed:', fallback1Error);
            
            try {
              // Try recreating AudioMixer
              console.log('Attempting fallback method 2: Recreate AudioMixer');
              audioMixerRef.current = new AudioMixer();
              await audioMixerRef.current.playTranslatedAudio(audio);
              console.log('✅ Fallback method 2 successful');
            } catch (fallback2Error) {
              console.error('❌ Fallback method 2 failed:', fallback2Error);
              
              // Last attempt: just echo base64 data to console for debug purposes
              console.error('All audio playback methods failed');
              console.log('Audio base64 data for debugging:');
              console.log(audio);
              throw new Error('All audio playback methods failed');
            }
          }
        } finally {
          // Close the beep context
          beepContext.close();
          
          // Remove the notification
          setTimeout(() => {
            document.body.removeChild(audioNotification);
          }, 3000);
        }
      } catch (err) {
        console.error('Error processing translated audio:', err);
        
        // Show error message to user
        const errorMsg = document.createElement('div');
        errorMsg.textContent = '❌ Audio playback failed';
        errorMsg.style.position = 'fixed';
        errorMsg.style.top = '20px';
        errorMsg.style.left = '50%';
        errorMsg.style.transform = 'translateX(-50%)';
        errorMsg.style.backgroundColor = 'rgba(255,0,0,0.7)';
        errorMsg.style.color = 'white';
        errorMsg.style.padding = '10px 20px';
        errorMsg.style.borderRadius = '20px';
        errorMsg.style.zIndex = '9999';
        document.body.appendChild(errorMsg);
        
        // Remove error message after 3 seconds
        setTimeout(() => {
          document.body.removeChild(errorMsg);
        }, 3000);
      }
    } else {
      console.warn('⚠️ No audio data received in translatedAudio event');
    }
  };

  // In the socket event listeners useEffect
  useEffect(() => {
    if (!socket) return;

    socket.on('translatedAudio', handleTranslatedAudio);
    socket.on('audioTranscript', ({ text, isLocal }) => {
      if (isLocal) {
        setLocalTranscript(text);
      } else {
        setRemoteTranscript(text);
      }
    });
    
    // Add these event listeners to capture call participant info
    socket.on('incomingCall', (data) => {
      console.log('Incoming call data:', data);
      if (data.caller) {
        setCallParticipant(data.caller);
      }
    });
    
    socket.on('callAccepted', (data) => {
      console.log('Call accepted data:', data);
      if (data.receiver) {
        setCallParticipant(data.receiver);
      }
    });
    
    // Add listener for call participant info
    socket.on('callParticipantInfo', (data) => {
      console.log('Received call participant info:', data);
      if (data.participantInfo) {
        setCallParticipant(data.participantInfo);
      }
    });
    
    socket.on('disconnect', () => {
      console.warn('Socket disconnected, attempting to reconnect...');
      socket.connect();
    });

    return () => {
      socket.off('translatedAudio', handleTranslatedAudio);
      socket.off('audioTranscript');
      socket.off('callParticipantInfo');
      socket.off('incomingCall');
      socket.off('callAccepted');
      socket.off('disconnect');
    };
  }, [socket]);

  return (
    <div className="relative h-[calc(100vh-220px)] rounded-lg p-4 overflow-hidden bg-black flex flex-col">
      {/* Remote Video */}
      <div className="flex-1 relative">
        <video
          ref={remoteVideoRef}
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover video-element"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>

      {/* Local Video */}
      <div className="absolute top-4 right-4 w-48 h-36 bg-black rounded-lg overflow-hidden shadow-lg">
        <video
          ref={localVideoRef}
          playsInline
          muted
          className="w-full h-full object-cover video-element"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>

      {/* Replace style jsx with style element */}
      <style>
        {`
          .video-element {
            -webkit-playsinline: 1;
            playsinline: 1;
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
        `}
      </style>

      {/* Transcripts overlay */}
      <div className="absolute top-4 left-4 right-4 flex justify-between z-30">
        {/* Local transcript */}
        <div className="bg-black bg-opacity-50 p-2 rounded-lg max-w-[45%]">
          <p className="text-sm text-gray-400">You:</p>
          <p className="text-white text-sm">{localTranscript}</p>
        </div>
        {/* Remote transcript */}
        <div className="bg-black bg-opacity-50 p-2 rounded-lg max-w-[45%]">
          <p className="text-sm text-gray-400">Remote:</p>
          <p className="text-white text-sm">{remoteTranscript}</p>
        </div>
      </div>

      {/* Translation overlay */}
      <div className="absolute bottom-20 left-0 right-0 bg-black bg-opacity-50 p-4 text-white">
        <div className="mb-2">
          <span className="text-sm text-gray-300">remote:</span>
          <p className="text-lg">{transcribedText}</p>
        </div>
        <div>
          <span className="text-sm text-gray-300">Translated:</span>
          <p className="text-lg">{translatedText}</p>
        </div>
      </div>

      {/* Control buttons */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4 z-20">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-600'} text-white shadow-lg hover:opacity-90 transition-opacity`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMuted ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            )}
          </svg>
        </button>
        <button
          onClick={toggleCamera}
          className={`p-4 rounded-full ${isCameraOff ? 'bg-red-500' : 'bg-gray-600'} text-white shadow-lg hover:opacity-90 transition-opacity`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isCameraOff ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            )}
          </svg>
        </button>
        <button
          onClick={endCall}
          className="p-4 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default VideoCall;