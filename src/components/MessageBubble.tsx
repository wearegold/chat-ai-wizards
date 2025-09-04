import React from 'react';
import { Message } from './ChatInterface';
import { Check, CheckCheck } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <div className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] px-3 py-2 rounded-2xl relative transition-all duration-200 hover:scale-[1.02]
          ${message.isUser
            ? 'bg-chat-user-bubble text-chat-user-text rounded-br-sm'
            : 'bg-chat-ai-bubble text-chat-ai-text border border-border/50 rounded-bl-sm'
          }
        `}
      >
        <p className="text-sm leading-relaxed break-words">{message.text}</p>
        <div className={`flex items-center gap-1 mt-1 ${message.isUser ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-xs ${message.isUser ? 'text-white/70' : 'text-muted-foreground'}`}>
            {formatTime(message.timestamp)}
          </span>
          {message.isUser && (
            <CheckCheck className="w-3 h-3 text-white/70" />
          )}
        </div>
      </div>
    </div>
  );
};