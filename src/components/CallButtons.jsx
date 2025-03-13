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
    <div>
      <button className=' px-4 mx-6 rounded-md' onClick={handleAudioCall} title="Audio Call">
        <PhoneIcon className="w-6 h-6" /> Audio Call
      </button>
      <button onClick={handleVideoCall} title="Video Call">
        <VideoCameraIcon className="w-6 h-6" /> Video Call
      </button>
    </div>
  );
};

export default CallButtons; 