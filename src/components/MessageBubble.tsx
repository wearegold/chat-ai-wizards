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
    <div className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`
          max-w-[70%] px-3 py-2 relative shadow-sm
          ${message.isUser
            ? 'bg-chat-user-bubble text-chat-user-text rounded-lg rounded-br-md'
            : 'bg-chat-ai-bubble text-chat-ai-text rounded-lg rounded-bl-md'
          }
        `}
      >
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.text}</p>
        <div className={`flex items-center gap-1 mt-1 ${message.isUser ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-xs ${message.isUser ? 'text-white/70' : 'text-gray-500'}`}>
            {formatTime(message.timestamp)}
          </span>
          {message.isUser && (
            <div className="flex">
              {message.isRead ? (
                <CheckCheck className="w-3 h-3 text-blue-400" />
              ) : (
                <CheckCheck className="w-3 h-3 text-white/50" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};