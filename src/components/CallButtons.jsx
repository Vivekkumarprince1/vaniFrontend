import React from 'react';
import { PhoneIcon, VideoCameraIcon } from '@heroicons/react/24/solid';

const CallButtons = ({ onAudioCall, onVideoCall }) => {
  const handleAudioCall = () => {
    onAudioCall('audio');
  };

  const handleVideoCall = () => {
    onVideoCall('video');
  };

  return (
    <div className="flex items-center space-x-3">
      <button 
        className="flex items-center space-x-2 p-2 rounded-full hover:bg-gray-100" 
        onClick={handleAudioCall} 
        title="Audio Call"
      >
        <PhoneIcon className="w-6 h-6 text-emerald-600" />
        <span className="hidden md:inline text-gray-700">Audio Call</span>
      </button>
      <button 
        className="flex items-center space-x-2 p-2 rounded-full hover:bg-gray-100" 
        onClick={handleVideoCall} 
        title="Video Call"
      >
        <VideoCameraIcon className="w-6 h-6 text-emerald-600" />
        <span className="hidden md:inline text-gray-700">Video Call</span>
      </button>
    </div>
  );
};

export default CallButtons;