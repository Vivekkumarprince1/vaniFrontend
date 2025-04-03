import React from 'react';

/**
 * Component to display real-time translations during video calls
 */
const TranslationOverlay = ({ transcribedText, translatedText }) => {
  return (
    <div className="absolute bottom-20 left-0 right-0 bg-black bg-opacity-50 p-4 text-white">
      <div className="mb-2">
        <span className="text-sm text-gray-300">Remote:</span>
        <p className="text-lg">{transcribedText}</p>
      </div>
      <div>
        <span className="text-sm text-gray-300">Translated:</span>
        <p className="text-lg">{translatedText}</p>
      </div>
    </div>
  );
};

export default TranslationOverlay; 