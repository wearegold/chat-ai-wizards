import React from 'react';

export const TypingIndicator = () => {
  return (
    <div className="flex justify-start">
      <div className="bg-chat-ai-bubble border border-border/50 px-4 py-3 rounded-2xl rounded-bl-sm max-w-[85%]">
        <div className="flex items-center gap-1">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-xs text-muted-foreground ml-2">AI is typing...</span>
        </div>
      </div>
    </div>
  );
};