import React from 'react';

/**
 * Component to display transcripts during video calls
 */
const TranscriptOverlay = ({ localTranscript, remoteTranscript }) => {
  return (
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
  );
};

export default TranscriptOverlay; 