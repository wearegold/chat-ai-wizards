import React from 'react';

export const TypingIndicator = () => {
  return (
    <div className="flex justify-start mb-1">
      <div className="bg-chat-ai-bubble shadow-sm px-4 py-3 rounded-lg rounded-bl-md max-w-[70%]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};