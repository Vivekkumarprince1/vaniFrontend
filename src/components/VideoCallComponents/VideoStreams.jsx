import React, { useEffect } from 'react';

/**
 * Component to display local and remote video streams during calls
 */
const VideoStreams = ({ localVideoRef, remoteVideoRef, localStream, remoteStream }) => {
  // Setup video streams when components receive new streams
  useEffect(() => {
    const setupVideo = async (ref, stream, isLocal) => {
      if (!ref.current || !stream) {
        console.log(`${isLocal ? 'Local' : 'Remote'} video ref or stream missing`);
        return;
      }

      try {
        // Reset video element
        ref.current.srcObject = null;
        
        // Set new stream
        ref.current.srcObject = stream;
        ref.current.muted = isLocal; // Only mute local video
        ref.current.playsInline = true;
        ref.current.autoplay = true;
        
        // Ensure video elements are properly sized
        ref.current.style.width = '100%';
        ref.current.style.height = '100%';
        ref.current.style.objectFit = 'cover';

        // Play with auto-play fallback
        try {
          await ref.current.play();
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

    if (localStream && localVideoRef.current) {
      setupVideo(localVideoRef, localStream, true);
    }
    
    if (remoteStream && remoteVideoRef.current) {
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
  }, [localStream, remoteStream, localVideoRef, remoteVideoRef]);

  return (
    <>
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

      {/* Style for video elements */}
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
    </>
  );
};

export default VideoStreams; 