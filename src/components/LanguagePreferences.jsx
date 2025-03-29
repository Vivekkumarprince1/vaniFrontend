import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const LanguagePreferences = ({ selectedLanguage, onLanguageChange }) => {
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [changingLanguage, setChangingLanguage] = useState(false);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/translator/languages`);
        // Transform the Azure languages data into the format required by react-select
        const formattedLanguages = Object.entries(response.data).map(([code, details]) => ({
          value: code,
          label: details.name,
          nativeName: details.nativeName
        }));
        setLanguages(formattedLanguages);
      } catch (err) {
        console.error('Error fetching languages:', err);
        setError('Failed to load languages');
      } finally {
        setLoading(false);
      }
    };

    fetchLanguages();
  }, []);

  const handleLanguageChange = async (option) => {
    try {
      setChangingLanguage(true);
      setError(null);
      const success = await onLanguageChange(option.value);
      if (!success) {
        throw new Error('Failed to update language preference');
      }
    } catch (err) {
      console.error('Error changing language:', err);
      setError('Failed to update language preference');
    } finally {
      setChangingLanguage(false);
    }
  };

  const customOption = ({ innerProps, label, data }) => (
    <div {...innerProps} className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
      <span className="font-medium">{label}</span>
      <span className="text-gray-500 ml-2 text-sm">({data.nativeName})</span>
    </div>
  );

  if (loading || changingLanguage) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
        <span className="text-sm text-gray-600">
          {loading ? 'Loading languages...' : 'Updating language...'}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 flex items-center space-x-2">
        <span>{error}</span>
        <button 
          onClick={() => setError(null)}
          className="text-emerald-600 hover:text-emerald-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className=" w-48">
      <Select
        value={languages.find(lang => lang.value === selectedLanguage)}
        onChange={handleLanguageChange}
        options={languages}
        className="basic-single text-black"
        classNamePrefix="select"
        isSearchable={true}
        name="language"
        placeholder="Language"
        components={{ Option: customOption }}
        formatOptionLabel={(option) => (
          <div className="flex items-center">
            <span className="font-medium">{option.label}</span>
            <span className="text-gray-500 ml-2 text-sm">({option.nativeName})</span>
          </div>
        )}
      />
    </div>
  );
};