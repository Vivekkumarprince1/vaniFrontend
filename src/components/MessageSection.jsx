import React, { useRef, useEffect } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import CallButtons from './CallButtons';
import VideoCall from './VideoCall';
import callSoundPlayer from '../utils/callSounds';

const MessageSection = ({
    selectedUser,
    selectedRoom,
    messages,
    message,
    setMessage,
    sendMessage,
    handleFileChange,
    isTyping,
    user,
    startCall,
    isCallActive,
    localVideoRef,
    remoteVideoRef,
    toggleMute,
    toggleCamera,
    endCall,
    isMuted,
    isCameraOff,
    incomingCall,
    answerCall,
    setIncomingCall,
    formatTime,
    localStream,
    remoteStream,
    peerConnection,
    socket
}) => {
    const { t } = useTranslation();
    const fileInputRef = useRef(null);
    const messageInputRef = useRef(null);
    const messagesEndRef = useRef(null);

    // Update scroll to bottom function to be instant
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    };

    // Add useEffect for auto-scrolling
    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]); // Scroll when messages change or typing status changes

    // Add scroll to bottom on component mount
    useEffect(() => {
        scrollToBottom();
    }, []);

    // Add useEffect hook for playing ringtone
    useEffect(() => {
        // Play ringtone when an incoming call is detected
        if (incomingCall) {
            console.log('Incoming call detected in MessageSection, playing ringtone');
            
            // Play the ringtone with a slight delay to ensure component is mounted
            const ringtoneTimeout = setTimeout(() => {
                try {
                    callSoundPlayer.playRingtone();
                    console.log('Ringtone started in MessageSection');
                    
                    // Create a user interaction handler to help with autoplay restrictions
                    const handleUserInteraction = () => {
                        try {
                            callSoundPlayer.playRingtone();
                        } catch (err) {
                            console.error('Error playing ringtone after user interaction:', err);
                        }
                    };
                    
                    // Add event listeners to catch any user interaction
                    document.addEventListener('click', handleUserInteraction, { once: true });
                    document.addEventListener('touchstart', handleUserInteraction, { once: true });
                    document.addEventListener('keydown', handleUserInteraction, { once: true });
                    
                    // Clean up event listeners after a reasonable time
                    setTimeout(() => {
                        document.removeEventListener('click', handleUserInteraction);
                        document.removeEventListener('touchstart', handleUserInteraction);
                        document.removeEventListener('keydown', handleUserInteraction);
                    }, 5000);
                } catch (err) {
                    console.error('Error playing ringtone from MessageSection:', err);
                }
            }, 100);
            
            // Clean up function
            return () => {
                clearTimeout(ringtoneTimeout);
            };
        } else {
            // Stop ringtone when incoming call is dismissed
            callSoundPlayer.stopAll();
        }
    }, [incomingCall]);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Fixed header */}
            <div className="bg-white shadow-sm p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    {selectedUser && (
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-lg font-semibold">
                                {selectedUser.avatar}
                            </div>
                            {selectedUser.status === 'online' && (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                            )}
                        </div>
                    )}
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">
                            {selectedUser?.name || selectedRoom || t('chat')}
                        </h2>
                        {selectedUser && (
                            <div className="text-sm text-gray-500">
                                {selectedUser.status === 'online' ? t('online') : t('offline')}
                            </div>
                        )}
                    </div>
                </div>
                {selectedUser && !isCallActive && (
                    <div className="flex space-x-2">
                        <CallButtons
                            onAudioCall={() => startCall('audio')}
                            onVideoCall={() => startCall('video')}
                        />
                    </div>
                )}
            </div>

            {/* Main content area with fixed video call and scrollable messages */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Video call container */}
                {isCallActive && (
                    <div className="flex-1 min-h-0">
                        <VideoCall
                            localStream={localStream}
                            remoteStream={remoteStream}
                            localVideoRef={localVideoRef}
                            remoteVideoRef={remoteVideoRef}
                            toggleMute={toggleMute}
                            toggleCamera={toggleCamera}
                            endCall={endCall}
                            isMuted={isMuted}
                            isCameraOff={isCameraOff}
                            peerConnection={peerConnection}
                            socket={socket}
                            selectedUser={selectedUser}
                        />
                    </div>
                )}

                {/* Incoming call notification */}
                {incomingCall && (
                    <div className="fixed inset-x-0 top-16 mx-auto w-80 bg-white rounded-xl shadow-2xl p-6 z-50 border border-gray-100">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                                {incomingCall.caller?.avatar || (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                )}
                            </div>
                            <p className="text-lg font-semibold text-gray-900 mb-2">{t('incomingCall')}</p>
                            <p className="text-gray-500 mb-2">{incomingCall.caller?.name || t('unknown')}</p>
                            <p className="text-sm text-gray-400 mb-6">
                                {t('language')}: {incomingCall.caller?.preferredLanguage || t('unknown')}
                            </p>
                            <div className="flex justify-center space-x-4">
                                <button
                                    onClick={() => {
                                        // First attempt - stop all sounds
                                        callSoundPlayer.stopAll();
                                        
                                        // Second attempt after slight delay 
                                        setTimeout(() => {
                                            callSoundPlayer.stopAll();
                                            callSoundPlayer.playAnswer();
                                        }, 100);
                                        
                                        // Third attempt - use a global event to force audio stop
                                        document.dispatchEvent(new CustomEvent('vani-stop-all-sounds'));
                                        
                                        // Now proceed with answering
                                        answerCall();
                                    }}
                                    className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors duration-200 flex items-center space-x-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    <span>{t('answer')}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        callSoundPlayer.stopAll();
                                        callSoundPlayer.playDisconnect();
                                        setIncomingCall(null);
                                    }}
                                    className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 flex items-center space-x-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span>{t('decline')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scrollable messages container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => {
                        // Determine if the message is from the current user
                        const isCurrentUser = msg.sender?._id === user._id || msg.sender === user._id;
                        
                        return (
                            <div
                                key={msg._id || index}
                                className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                                        isCurrentUser
                                            ? 'bg-emerald-500 text-white rounded-br-none'
                                            : 'bg-white text-gray-800 rounded-bl-none'
                                    } shadow-md`}
                                >
                                    <div className="break-words text-[15px]">{msg.content}</div>
                                    <div className={`text-[11px] mt-1 flex items-center justify-end space-x-1 ${
                                        isCurrentUser ? 'text-emerald-100' : 'text-gray-500'
                                    }`}>
                                        <span>{formatTime(msg.timestamp)}</span>
                                        {isCurrentUser && (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    
                    {isTyping && selectedUser && (
                        <div className="flex items-center space-x-2 text-gray-500">
                            <div className="bg-white rounded-full p-4 shadow-md">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef}></div>
                </div>
            </div>

            {/* Fixed input area at bottom */}
            <div className="bg-white p-4 shadow-lg">
                <form 
                    onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                    className="flex items-center space-x-2"
                >
                    <label 
                        htmlFor="file-input"
                        className="p-2 text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                    </label>
                    <input
                        type="file"
                        id="file-input"
                        className="hidden"
                        onChange={handleFileChange}
                        ref={fileInputRef}
                    />
                    <div className="relative flex-1">
                        <input
                            type="text"
                            className="w-full rounded-full border border-gray-300 pl-4 pr-12 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            placeholder={t('typeMessage')}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            ref={messageInputRef}
                        />
                        <button 
                            type="submit"
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-colors shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
};

export default MessageSection;