import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Create the context
export const TranslationContext = createContext();

// Translation cache to store previously translated text
const translationCache = new Map();

// Available languages
const AVAILABLE_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
];

// UI translations for common text
const UI_TRANSLATIONS = {
  en: {
    welcome: 'Welcome',
    chat: 'Chat',
    send: 'Send',
    typeMessage: 'Type a message...',
    online: 'Online',
    offline: 'Offline',
    contacts: 'Contacts',
    groups: 'Groups',
    groupChat: 'Group Chat',
    logout: 'Logout',
    loading: 'Loading...',
    answer: 'Answer',
    decline: 'Decline',
    mute: 'Mute',
    unmute: 'Unmute',
    camera: 'Camera On',
    cameraOff: 'Camera Off',
    endCall: 'End Call',
    incomingCall: 'Incoming Call',
    toggleSidebar: 'Toggle Sidebar',
  },
  // Add more languages as needed
};

export const TranslationProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    return localStorage.getItem('preferredLanguage') || 'en';
  });

  // Load saved language preference on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('preferredLanguage');
    if (savedLanguage) {
      setCurrentLanguage(savedLanguage);
    }
  }, []);

  // Save language preference when it changes
  useEffect(() => {
    localStorage.setItem('preferredLanguage', currentLanguage);
  }, [currentLanguage]);

  // Function to change the current language
  const changeLanguage = async (language) => {
    try {
      // Get the auth token
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return false;
      }

      // Update language preference in the backend
      await axios.put(
        `${API_URL}/api/auth/language`,
        { language },
        {
          headers: {
            'x-auth-token': token
          }
        }
      );

      // Update local state and storage
      setCurrentLanguage(language);
      localStorage.setItem('preferredLanguage', language);
      
      // Clear translation cache when language changes
      translationCache.clear();
      
      return true;
    } catch (error) {
      console.error('Error changing language:', error);
      return false;
    }
  };

  // Function to translate text
  const translateText = async (text, targetLang = currentLanguage) => {
    if (!text) return '';
    if (targetLang === 'en') return text; // Don't translate if target is English

    // Check cache first
    const cacheKey = `${text}:${targetLang}`;
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    try {
      const response = await axios.post(`${API_URL}/api/chat/translate`, {
        text,
        targetLang
      });

      const translation = response.data.translation;
      
      // Cache the translation
      translationCache.set(cacheKey, translation);
      
      return translation;
    } catch (error) {
      console.error('Translation error:', error);
      return text; // Return original text if translation fails
    }
  };

  // Function to get UI translations
  const t = (key) => {
    const translations = UI_TRANSLATIONS[currentLanguage] || UI_TRANSLATIONS.en;
    return translations[key] || UI_TRANSLATIONS.en[key] || key;
  };

  const value = {
    currentLanguage,
    changeLanguage,
    translateText,
    t,
    availableLanguages: AVAILABLE_LANGUAGES
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};

// Custom hook to use the translation context
export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}; 