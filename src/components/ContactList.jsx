import React from 'react';
import { useTranslation } from '../contexts/TranslationContext';

const ContactList = ({ 
    users, 
    rooms, 
    selectedUser, 
    selectedRoom, 
    selectUser, 
    selectRoom, 
    createRoom, 
    showSidebar 
}) => {
    const { t } = useTranslation();

    // Helper function to format last seen time
    const formatLastSeen = (lastSeen) => {
        if (!lastSeen) return '';
        
        const date = new Date(lastSeen);
        const now = new Date();
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (diffInMinutes < 1) return t('justNow');
        if (diffInMinutes < 60) return `${diffInMinutes} ${t('minutesAgo')}`;
        if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} ${t('hoursAgo')}`;
        if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)} ${t('daysAgo')}`;
        return date.toLocaleDateString();
    };

    return (
        <aside className={`fixed lg:static w-80 bg-white h-full z-20 transform transition-transform duration-300 ease-in-out ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} shadow-lg`}>
            <div className="flex flex-col h-full">
                <div className="p-4 bg-gray-50 border-b">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-700">{t('contacts')}</h2>
                        <button 
                            className="w-9 h-9 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                            onClick={createRoom}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Search bar */}
                    <div className="p-3">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={t('search')}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>

                    {/* Users list */}
                    <div className="px-2">
                        <ul className="space-y-0.5">
                            {users.map(user => (
                                <li
                                    key={user.id}
                                    className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-gray-100 ${
                                        selectedUser?.id === user.id ? 'bg-emerald-50 hover:bg-emerald-100' : ''
                                    }`}
                                    onClick={() => selectUser(user)}
                                >
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-lg font-semibold shadow-md">
                                            {user.avatar}
                                        </div>
                                        {user.status === 'online' && (
                                            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                                        )}
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <div className="flex items-center justify-between">
                                            <div className="font-semibold text-gray-900">{user.name}</div>
                                            <div className="text-xs text-gray-500">
                                                {user.status === 'online' ? t('online') : formatLastSeen(user.lastSeen)}
                                            </div>
                                        </div>
                                        <div className="text-sm text-gray-500 flex items-center space-x-1">
                                            {user.status === 'online' ? (
                                                <>
                                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                    <span>{t('online')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
                                                    <span>{t('offline')}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Groups list */}
                    <div className="px-2 mt-4">
                        <div className="px-3 py-2 text-sm font-semibold text-gray-500 flex items-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span>{t('groups')}</span>
                        </div>
                        <ul className="space-y-0.5">
                            {rooms.map(room => (
                                <li
                                    key={room}
                                    className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-gray-100 ${
                                        selectedRoom === room ? 'bg-emerald-50 hover:bg-emerald-100' : ''
                                    }`}
                                    onClick={() => selectRoom(room)}
                                >
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-lg font-semibold shadow-md">
                                        G
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <div className="flex items-center justify-between">
                                            <div className="font-semibold text-gray-900">{room}</div>
                                            <div className="text-xs text-gray-500">{formatLastSeen(room.lastSeen)}</div>
                                        </div>
                                        <div className="text-sm text-gray-500">{t('groupChat')}</div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default ContactList; 