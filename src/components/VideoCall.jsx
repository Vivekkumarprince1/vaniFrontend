import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';

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
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const lastProcessedTime = useRef(0);
  const PROCESS_INTERVAL = 1000; // Process every 1 second

  useEffect(() => {
    if (!localStream || !peerConnection) return;

    // Initialize audio processing
    setupAudioProcessing();

    return () => {
      cleanupAudioProcessing();
    };
  }, [localStream, peerConnection]);

  const setupAudioProcessing = async () => {
    try {
      // Create audio context and processor
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const audioTrack = localStream.getAudioTracks()[0];
      
      // Create media stream source
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(new MediaStream([audioTrack]));
      
      // Create script processor for audio processing
      processorNodeRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // Connect nodes
      sourceNodeRef.current.connect(processorNodeRef.current);
      processorNodeRef.current.connect(audioContextRef.current.destination);
      
      // Process audio data
      processorNodeRef.current.onaudioprocess = async (e) => {
        const now = Date.now();
        if (now - lastProcessedTime.current < PROCESS_INTERVAL) {
          return; // Skip if less than 1 second has passed
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData);
        
        // Convert Float32Array to ArrayBuffer
        const buffer = new ArrayBuffer(audioData.length * 4);
        const view = new DataView(buffer);
        audioData.forEach((value, index) => {
          view.setFloat32(index * 4, value, true);
        });
        
        // Send audio data for translation
        socket.emit('translateAudio', {
          audio: buffer,
          sourceLanguage: currentLanguage,
          targetLanguage: selectedUser?.preferredLanguage || 'en',
          userId: selectedUser?.id
        });

        lastProcessedTime.current = now;
      };
    } catch (error) {
      console.error('Error setting up audio processing:', error);
    }
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

  // Single useEffect for video streams
  useEffect(() => {
    const setupVideo = async (ref, stream, isLocal) => {
      if (!ref.current || !stream) return;

      try {
        // Reset video element
        ref.current.srcObject = null;
        ref.current.muted = isLocal; // Local video should always be muted
        
        // Set new stream
        ref.current.srcObject = stream;
        
        // Configure video element
        ref.current.style.display = 'block';
        ref.current.style.width = '100%';
        ref.current.style.height = '100%';
        ref.current.style.objectFit = 'cover';

        // Play video with retries
        try {
          await ref.current.play();
          console.log(`${isLocal ? 'Local' : 'Remote'} video playing with tracks:`, 
            stream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              muted: t.muted
            }))
          );
        } catch (err) {
          console.error(`Error playing ${isLocal ? 'local' : 'remote'} video:`, err);
          // For remote video, try playing with muted as fallback
          if (!isLocal) {
            ref.current.muted = true;
            await ref.current.play();
          }
        }
      } catch (err) {
        console.error(`Error setting up ${isLocal ? 'local' : 'remote'} video:`, err);
      }
    };

    // Handle local stream
    if (localStream) {
      setupVideo(localVideoRef, localStream, true);
    }

    // Handle remote stream
    if (remoteStream) {
      setupVideo(remoteVideoRef, remoteStream, false);
    }

    return () => {
      // Cleanup
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };
  }, [localStream, remoteStream]);

  useEffect(() => {
    if (!socket) return;

    // Listen for translated audio and text
    socket.on('translatedAudio', ({ text, audio }) => {
      // Update transcribed/translated text
      setTranscribedText(text.original);
      setTranslatedText(text.translated);

      // Play translated audio
      if (audio) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Convert ArrayBuffer to AudioBuffer
        audioContext.decodeAudioData(audio, (buffer) => {
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContext.destination);
          source.start(0);
        }).catch(err => {
          console.error('Error decoding audio data:', err);
        });
      }
    });

    return () => {
      socket.off('translatedAudio');
    };
  }, [socket]);

  return (
    <div className="relative h-[calc(100vh-160px)] rounded-lg m-4 overflow-hidden bg-black flex flex-col">
      {/* Remote Video - Make it fill the container */}
      <div className="flex-1 relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}  // Mirror the video
        />
      </div>

      {/* Local Video - Position it in the corner */}
      <div className="absolute top-4 right-4 w-48 h-36 bg-black rounded-lg overflow-hidden shadow-lg">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}  // Mirror the video
        />
      </div>

      {/* Translation overlay */}
      <div className="absolute bottom-20 left-0 right-0 bg-black bg-opacity-50 p-4 text-white">
        <div className="mb-2">
          <span className="text-sm text-gray-300">You said:</span>
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