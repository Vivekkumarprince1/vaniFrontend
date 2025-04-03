import { useState, useEffect, useRef } from 'react';
import { createOptimizedAudioContext, hasSound, convertToInt16, createWavBuffer, convertToBase64 } from '../utils/audioProcessing';
import AudioMixer from '../services/AudioMixer';

/**
 * Custom hook for audio processing in calls
 */
const useAudioProcessing = (localStream, remoteStream, socket, selectedUser, currentLanguage) => {
  const [transcribedText, setTranscribedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [localTranscript, setLocalTranscript] = useState('');
  const [remoteTranscript, setRemoteTranscript] = useState('');
  const [isRemoteAudioProcessing, setIsRemoteAudioProcessing] = useState(false);
  const [callParticipant, setCallParticipant] = useState(null);
  
  // Audio processing refs
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const remoteSourceNodeRef = useRef(null);
  const remoteAudioProcessorRef = useRef(null);
  const audioMixerRef = useRef(null);

  // Initialize AudioMixer for translated speech playback
  useEffect(() => {
    audioMixerRef.current = new AudioMixer();
    
    // Inform server that audio system is ready
    if (socket?.connected) {
      socket.emit('audioSystemReady', { ready: true });
      console.log('Audio system ready event sent to server');
    }
    
    // Create a function to unlock audio context on user interaction
    const unlockAudio = async () => {
      try {
        if (audioMixerRef.current) {
          await audioMixerRef.current.ensureAudioContextActive();
          console.log('Audio context unlocked by user interaction');
        }
      } catch (err) {
        console.warn('Error unlocking audio context:', err);
      }
    };
    
    // Add event listeners to unlock audio on user interaction
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    
    return () => {
      // Clean up event listeners
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      
      if (audioMixerRef.current) {
        audioMixerRef.current.close();
      }
    };
  }, [socket]);

  // Helper function to get the correct target user (either selectedUser or callParticipant)
  const getTargetUser = () => {
    return callParticipant || selectedUser;
  };

  // Request participant info from server when mounted
  useEffect(() => {
    if (!socket?.connected || !selectedUser?.id) return;
    
    socket.emit('getCallParticipantInfo', { userId: selectedUser.id });
  }, [socket, selectedUser]);

  // Initialize audio processing for local and remote streams
  useEffect(() => {
    if (!localStream || !remoteStream || !socket?.connected) return;

    setupAudioProcessing();
    setupRemoteAudioProcessing();

    return () => {
      cleanupAudioProcessing();
      cleanupRemoteAudioProcessing();
    };
  }, [localStream, remoteStream, socket, callParticipant, currentLanguage]);

  // Audio processing setup for local stream
  const setupAudioProcessing = async () => {
    try {
      // Initialize audio context
      audioContextRef.current = createOptimizedAudioContext();
      const audioTrack = localStream.getAudioTracks()[0];
      
      if (!audioTrack) {
        console.error('No audio track found');
        return;
      }
      
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(
        new MediaStream([audioTrack])
      );
      
      setupScriptProcessor();
    } catch (error) {
      console.error('Audio processing setup failed:', error);
    }
  };

  // Script processor for local audio
  const setupScriptProcessor = () => {
    processorNodeRef.current = audioContextRef.current.createScriptProcessor(8192, 1, 1);
    let audioBuffer = new Float32Array();
    let lastProcessingTime = Date.now();
    let isProcessing = false;
    
    processorNodeRef.current.onaudioprocess = (e) => {
      // Skip if muted or already processing
      if (!socket?.connected || isProcessing) return;
  
      const inputData = e.inputBuffer.getChannelData(0);
      const newBuffer = new Float32Array(audioBuffer.length + inputData.length);
      newBuffer.set(audioBuffer);
      newBuffer.set(inputData, audioBuffer.length);
      audioBuffer = newBuffer;
      
      const now = Date.now();
      // Process every 3 seconds for better recognition
      if (now - lastProcessingTime >= 3000 && audioBuffer.length > 0) {
        if (hasSound(audioBuffer)) {
          isProcessing = true;
          sendAudioForTranslation(audioBuffer)
            .finally(() => {
              isProcessing = false;
              audioBuffer = new Float32Array();
              lastProcessingTime = now;
            });
        } else {
          // Clear buffer if no sound detected
          audioBuffer = new Float32Array();
          lastProcessingTime = now;
        }
      }
    };
  
    sourceNodeRef.current.connect(processorNodeRef.current);
    processorNodeRef.current.connect(audioContextRef.current.destination);
  };

  // Audio processing setup for remote stream
  const setupRemoteAudioProcessing = async () => {
    try {
      if (!currentLanguage) return;

      const remoteAudioTrack = remoteStream.getAudioTracks()[0];
      if (!remoteAudioTrack) {
        console.error('No remote audio track found');
        return;
      }

      remoteSourceNodeRef.current = audioContextRef.current.createMediaStreamSource(
        new MediaStream([remoteAudioTrack])
      );
      setupRemoteScriptProcessor();
    } catch (error) {
      console.error('Remote audio processing setup failed:', error);
    }
  };

  // Script processor for remote audio
  const setupRemoteScriptProcessor = () => {
    remoteAudioProcessorRef.current = audioContextRef.current.createScriptProcessor(8192, 1, 1);
    let remoteAudioBuffer = new Float32Array();
    let lastRemoteProcessingTime = Date.now();
    
    remoteAudioProcessorRef.current.onaudioprocess = (e) => {
      // Don't process if already processing or socket not connected
      if (isRemoteAudioProcessing || !socket?.connected) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const newBuffer = new Float32Array(remoteAudioBuffer.length + inputData.length);
      newBuffer.set(remoteAudioBuffer);
      newBuffer.set(inputData, remoteAudioBuffer.length);
      remoteAudioBuffer = newBuffer;
      
      const now = Date.now();
      // Process every 3 seconds for better recognition
      if (now - lastRemoteProcessingTime >= 3000 && remoteAudioBuffer.length > 0) {
        // Check for actual speech with a reasonable threshold
        if (hasSound(remoteAudioBuffer, 0.005)) {
          console.log('Sound detected in remote audio, processing...');
          setIsRemoteAudioProcessing(true);
          sendRemoteAudioForTranslation(remoteAudioBuffer)
            .finally(() => {
              setIsRemoteAudioProcessing(false);
              remoteAudioBuffer = new Float32Array();
              lastRemoteProcessingTime = now;
            });
        } else {
          // Clear buffer if no sound detected
          remoteAudioBuffer = new Float32Array();
          lastRemoteProcessingTime = now;
        }
      }
    };

    remoteSourceNodeRef.current.connect(remoteAudioProcessorRef.current);
    remoteAudioProcessorRef.current.connect(audioContextRef.current.destination);
  };

  // Send local audio for translation
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
      
      console.log('Sending local audio for translation:', {
        sourceLanguage: currentLanguage, 
        targetLanguage, 
        userId: targetUserId
      });
      
      // Convert to PCM and create WAV buffer
      const pcmData = convertToInt16(audioData);
      const wavBuffer = createWavBuffer(pcmData);
      const base64Audio = await convertToBase64(wavBuffer);
      
      // Include requestId for tracking
      const requestId = `local-${Date.now()}`;
      
      socket.emit('translateAudio', {
        audio: base64Audio,
        sourceLanguage: currentLanguage,
        targetLanguage,
        userId: targetUserId,
        sampleRate: 16000,
        encoding: 'WAV',
        requestId
      });
    } catch (error) {
      console.error('Error sending audio for translation:', error);
    }
  };

  // Send remote audio for translation
  const sendRemoteAudioForTranslation = async (audioData) => {
    try {
      // Check socket connection before proceeding
      if (!socket?.connected) {
        console.warn('Socket not connected, cannot send remote audio for translation');
        return;
      }
      
      const targetUser = getTargetUser();
      // Use fallback values if target user info is missing
      const sourceLanguage = targetUser?.preferredLanguage || 'en';
      const targetUserId = targetUser?.id || 'unknown';
      
      console.log('Sending remote audio for translation:', {
        sourceLanguage, 
        targetLanguage: currentLanguage, 
        userId: targetUserId
      });
      
      // Convert to PCM and create WAV buffer
      const pcmData = convertToInt16(audioData);
      const wavBuffer = createWavBuffer(pcmData);
      const base64Audio = await convertToBase64(wavBuffer);
      
      // Include requestId for tracking
      const requestId = `remote-${Date.now()}`;
      
      socket.emit('translateRemoteAudio', {
        audio: base64Audio,
        sourceLanguage,
        targetLanguage: currentLanguage,
        userId: targetUserId,
        sampleRate: 16000,
        encoding: 'WAV',
        requestId
      });
    } catch (error) {
      console.error('Error sending remote audio for translation:', error);
    }
  };

  // Cleanup functions
  const cleanupAudioProcessing = () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
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

  // Set up audio translation event listeners
  useEffect(() => {
    if (!socket) return;

    // Add an isPlaying flag to prevent multiple playbacks
    let isPlaying = false;
    
    // Handle translated audio from either direction
    const handleTranslatedAudio = async (data) => {
      if (!data) return;
      
      // Skip if already playing audio to prevent repeats
      if (isPlaying) {
        console.log('Already playing audio, skipping to prevent repeats');
        return;
      }

      console.log(`⭐ RECEIVED translatedAudio event, direction: ${data.requestId?.startsWith('remote') ? 'remote->local' : 'local->remote'}`, {
        hasText: !!data.text,
        hasAudio: !!data.audio,
        audioLength: data.audio ? data.audio.length : 0
      });

      const { text, audio, requestId } = data;
      
      // Update UI with transcription/translation text
      if (text) {
        setTranscribedText(text.original || '');
        setTranslatedText(text.translated || '');
      }

      // Play the translated audio if available
      if (audio) {
        try {
          isPlaying = true;
          
          // Create new mixer if it doesn't exist yet
          if (!audioMixerRef.current) {
            audioMixerRef.current = new AudioMixer();
            console.log('Created new AudioMixer instance for translation');
          }
          
          // Show UI notification
          const audioNotification = document.createElement('div');
          audioNotification.textContent = '🔊 Incoming translated audio...';
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
          
          // Ensure audio context is active first
          await audioMixerRef.current.ensureAudioContextActive();
          
          // Define a variable to track if we've successfully played audio
          let playbackSuccessful = false;
          
          // Try primary method
          try {
            console.log('Attempting primary method: AudioMixer.playTranslatedAudio');
            await audioMixerRef.current.playTranslatedAudio(audio);
            console.log('✅ Primary audio playback successful');
            playbackSuccessful = true;
          } catch (playError) {
            console.error('❌ Primary audio playback failed:', playError);
            
            // Only try fallback if primary method failed
            if (!playbackSuccessful) {
              try {
                // Try audio element as fallback
                console.log('Attempting fallback method: HTML Audio element');
                const audioElement = new Audio(`data:audio/wav;base64,${audio}`);
                
                // Add event listeners for debugging
                audioElement.addEventListener('canplaythrough', () => {
                  console.log('Audio element can play through');
                });
                
                audioElement.addEventListener('error', (e) => {
                  console.error('Audio element error:', e.target.error);
                });
                
                await audioElement.play();
                console.log('✅ Fallback method successful');
                playbackSuccessful = true;
              } catch (fallbackError) {
                console.error('❌ All audio playback methods failed:', fallbackError);
              }
            }
          } finally {
            // Remove the notification
            setTimeout(() => {
              if (document.body.contains(audioNotification)) {
                document.body.removeChild(audioNotification);
              }
            }, 3000);
            
            // Reset the playing flag when audio is done
            setTimeout(() => {
              isPlaying = false;
              console.log('Audio playback complete, ready for next audio');
            }, 5000); // Safe timeout to ensure audio is finished
          }
        } catch (error) {
          console.error('Error playing translated audio:', error);
          isPlaying = false; // Reset flag on error
        }
      } else {
        console.warn('Received translatedAudio event without audio data');
      }
    };

    // Register socket event listeners - only use the main event to prevent duplicates
    socket.on('translatedAudio', handleTranslatedAudio);
    
    // Also handle specific translation events - in case the backend uses different events for different directions
    socket.on('localAudioTranslated', handleTranslatedAudio);
    socket.on('remoteAudioTranslated', handleTranslatedAudio);
    
    // Handle transcript updates
    socket.on('audioTranscript', ({ text, isLocal }) => {
      console.log(`Received transcript update, isLocal: ${isLocal}`, { text });
      if (isLocal) {
        setLocalTranscript(text);
      } else {
        setRemoteTranscript(text);
      }
    });
    
    // Handle participant info updates
    socket.on('callParticipantInfo', (data) => {
      if (data.participantInfo) {
        console.log('Received call participant info:', data.participantInfo);
        setCallParticipant(data.participantInfo);
      }
    });

    // Add listeners for debugging
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      socket.off('translatedAudio', handleTranslatedAudio);
      socket.off('localAudioTranslated', handleTranslatedAudio);
      socket.off('remoteAudioTranslated', handleTranslatedAudio);
      socket.off('audioTranscript');
      socket.off('callParticipantInfo');
      socket.off('error');
    };
  }, [socket]);

  return {
    transcribedText,
    translatedText,
    localTranscript,
    remoteTranscript,
    callParticipant,
    setCallParticipant
  };
};

export default useAudioProcessing; 