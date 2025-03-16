import React, { useState } from 'react';
import CallButtons from './CallButtons';
import { LanguagePreferences } from './LanguagePreferences';

const ChatContainer = () => {
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const handleAudioCall = () => {
    // Implement audio call logic here
    console.log('Starting audio call...');
  };

  const handleVideoCall = () => {
    // Implement video call logic here
    console.log('Starting video call...');
  };

  const handleLanguageChange = (language) => {
    setSelectedLanguage(language);
    // Implement language change logic here
    console.log('Language changed to:', language);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white  shadow p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">Chat</h1>
          <CallButtons
            onAudioCall={handleAudioCall}
            onVideoCall={handleVideoCall}
          />
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Chat messages will go here */}
      </div>

      {/* Language preferences and input area */}
      <div className="bg-white border-t p-4">
        {/* <LanguagePreferences
          selectedLanguage={selectedLanguage}
          onLanguageChange={handleLanguageChange}
        /> */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Type your message..."
            className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
};

export default ChatContainer; 