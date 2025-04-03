import React from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import useAudioProcessing from '../hooks/useAudioProcessing';
import VideoStreams from './VideoCallComponents/VideoStreams';
import TranscriptOverlay from './VideoCallComponents/TranscriptOverlay';
import TranslationOverlay from './VideoCallComponents/TranslationOverlay';
import CallControls from './VideoCallComponents/CallControls';

/**
 * VideoCall component to handle video calls with real-time translation
 */
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
  
  // Use our custom hook for audio processing and translation
  const {
    transcribedText,
    translatedText,
    localTranscript,
    remoteTranscript
  } = useAudioProcessing(
    localStream,
    remoteStream,
    socket, 
    selectedUser,
    currentLanguage
  );

  return (
    <div className="relative h-[calc(100vh-220px)] rounded-lg p-4 overflow-hidden bg-black flex flex-col">
      {/* Video streams (local and remote) */}
      <VideoStreams
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        localStream={localStream}
        remoteStream={remoteStream}
      />

      {/* Transcript overlay showing real-time speech */}
      <TranscriptOverlay
        localTranscript={localTranscript}
        remoteTranscript={remoteTranscript}
      />

      {/* Translation overlay showing original and translated text */}
      <TranslationOverlay
        transcribedText={transcribedText}
        translatedText={translatedText}
      />

      {/* Call controls (mute, camera, end call) */}
      <CallControls
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        endCall={endCall}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
      />
    </div>
  );
};

export default VideoCall;