import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguagePreferences } from './LanguagePreferences';
import { useTranslation } from '../contexts/TranslationContext';

const Header = ({ user, toggleSidebar, handleLanguageChange }) => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useTranslation();

    const logout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <header className="fixed top-0 left-0 right-0 bg-emerald-600 text-white z-30 h-16 flex items-center justify-between px-4 shadow-lg">
            <div className="flex items-center space-x-3">
                <button
                    className="lg:hidden flex flex-col space-y-1.5 p-2 hover:bg-emerald-700 rounded-lg transition-colors"
                    onClick={toggleSidebar}
                    aria-label={t('toggleSidebar')}
                >
                    <span className="block w-6 h-0.5 bg-white"></span>
                    <span className="block w-6 h-0.5 bg-white"></span>
                    <span className="block w-6 h-0.5 bg-white"></span>
                </button>
                <h1 className="text-xl font-semibold tracking-wide">{t('welcome')}</h1>
            </div>
            <div className="flex items-center space-x-4">
                <div className="hidden sm:block">
                    <LanguagePreferences
                        selectedLanguage={currentLanguage}
                        onLanguageChange={handleLanguageChange}
                    />
                </div>
                <div className="hidden sm:flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center text-lg font-semibold">
                        {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium">{user?.username}</span>
                </div>
                <button 
                    onClick={logout}
                    className="px-4 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center space-x-1"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>{t('logout')}</span>
                </button>
            </div>
        </header>
    );
};

export default Header; 