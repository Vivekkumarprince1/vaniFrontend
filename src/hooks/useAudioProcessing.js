import { useState, useEffect, useRef } from 'react';
import { createOptimizedAudioContext, hasSound, convertToInt16, createWavBuffer, convertToBase64 } from '../utils/audioProcessing';
import AudioMixer from '../services/AudioMixer';

/**
 * Custom hook for audio processing in calls with optimized playback queue
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
  
  // Audio playback queue system
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  
  // Track processed audio to prevent duplicates
  const processedAudioIdsRef = useRef(new Set());

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

  // Audio queue processor
  const processAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    
    try {
      isPlayingRef.current = true;
      const nextAudio = audioQueueRef.current.shift();
      
      // Show audio notification
      const audioNotification = document.createElement('div');
      audioNotification.textContent = '🔊 Playing translated audio...';
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
      
      console.log(`Playing audio ${audioQueueRef.current.length + 1} from queue (${audioQueueRef.current.length} remaining)`);
      
      try {
        // Ensure audio context is active
        await audioMixerRef.current.ensureAudioContextActive();
        await audioMixerRef.current.playTranslatedAudio(nextAudio);
        console.log('✅ Audio playback successful');
      } catch (error) {
        console.error('Primary playback failed, trying fallback:', error);
        
        try {
          // Fallback to Audio element
          const audioElement = new Audio(`data:audio/wav;base64,${nextAudio}`);
          const playPromise = audioElement.play();
          
          await playPromise;
          console.log('✅ Fallback audio playback successful');
        } catch (fallbackError) {
          console.error('❌ All playback methods failed:', fallbackError);
        }
      } finally {
        // Remove notification
        if (document.body.contains(audioNotification)) {
          document.body.removeChild(audioNotification);
        }
        
        // Small delay before processing next item to ensure smooth transitions
        setTimeout(() => {
          isPlayingRef.current = false;
          processAudioQueue(); // Process next audio in queue
        }, 500);
      }
    } catch (error) {
      console.error('Error in processAudioQueue:', error);
      isPlayingRef.current = false;
      processAudioQueue(); // Try next item in queue
    }
  };

  // Helper function to add audio to queue and start processing
  // Add a generateAudioId function to create a unique identifier for audio data
  const generateAudioId = (audioData, requestId) => {
    // Use requestId if available, otherwise use a hash of the first few bytes of audio data
    if (requestId) return requestId;
    
    // Simple hash function for audio data
    let hash = 0;
    const sample = audioData.substring(0, 100); // Use first 100 chars of base64
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash) + sample.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return `audio-${Date.now()}-${hash}`;
  };

  // Modified queueAudio function to prevent duplicates
  const queueAudio = (audioData, requestId) => {
    // Generate an ID for this audio
    const audioId = generateAudioId(audioData, requestId);
    
    // Check if we've already processed this audio
    if (processedAudioIdsRef.current.has(audioId)) {
      console.log(`Skipping duplicate audio with ID: ${audioId}`);
      return;
    }
    
    // Add to processed set
    processedAudioIdsRef.current.add(audioId);
    
    // Limit the size of the set to prevent memory leaks
    if (processedAudioIdsRef.current.size > 100) {
      const oldestId = Array.from(processedAudioIdsRef.current)[0];
      processedAudioIdsRef.current.delete(oldestId);
    }
    
    // Add to queue
    audioQueueRef.current.push(audioData);
    console.log(`Added audio to queue (queue length: ${audioQueueRef.current.length}, ID: ${audioId})`);
    
    // Start processing queue if not already playing
    if (!isPlayingRef.current) {
      processAudioQueue();
    }
  };

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
    
    // Handle translated audio coming from any socket event
    const handleTranslatedAudio = async (data) => {
      if (!data) return;

      const { text, audio, requestId } = data;
      
      console.log(`⭐ RECEIVED translatedAudio event, direction: ${requestId?.startsWith('remote') ? 'remote->local' : 'local->remote'}`, {
        hasText: !!text,
        hasAudio: !!audio,
        audioLength: audio ? audio.length : 0,
        requestId
      });

      // Update UI with transcription/translation text
      if (text) {
        setTranscribedText(text.original || '');
        setTranslatedText(text.translated || '');
      }

      // Queue the translated audio if available, passing requestId to prevent duplicates
      if (audio) {
        queueAudio(audio, requestId);
      } else {
        console.warn('Received translatedAudio event without audio data');
      }
    };

    // Choose a single event to listen to based on your backend implementation
    // Option 1: If you want to use a single event for all translations:
    socket.on('translatedAudio', handleTranslatedAudio);
    
    // OR Option 2: If you need separate events for local and remote
    // socket.on('localAudioTranslated', handleTranslatedAudio);
    // socket.on('remoteAudioTranslated', handleTranslatedAudio);
    // Don't enable both options at once - that was causing duplicates
    
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
      // If using separate events instead:
      // socket.off('localAudioTranslated', handleTranslatedAudio);
      // socket.off('remoteAudioTranslated', handleTranslatedAudio);
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