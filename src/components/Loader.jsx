import React from 'react';

const Loader = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-r from-emerald-50 to-teal-50 z-50">
      <div className="relative">
        {/* Outer circle */}
        <div className="w-20 h-20 border-4 border-emerald-200 rounded-full animate-ping opacity-75 absolute"></div>
        
        {/* Middle circle */}
        <div className="w-20 h-20 border-4 border-emerald-300 rounded-full animate-pulse absolute"></div>
        
        {/* Inner circle with logo */}
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg relative z-10 animate-bounce">
          <span className="text-3xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">V</span>
        </div>
      </div>
      
      {/* Loading text */}
      <div className="mt-8 bg-white px-6 py-3 rounded-full shadow-md">
        <p className="text-emerald-700 font-medium">{message}</p>
      </div>
      
      {/* Animated dots */}
      <div className="flex mt-4 space-x-2">
        <div className="w-3 h-3 bg-emerald-400 rounded-full animate-bounce"></div>
        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce delay-100"></div>
        <div className="w-3 h-3 bg-emerald-600 rounded-full animate-bounce delay-200"></div>
      </div>
    </div>
  );
};

export default Loader; 