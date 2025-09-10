import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

export interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  isRead?: boolean;
}

interface UserInfo {
  name?: string;
  industry?: string;
  email?: string;
  phone?: string;
  city?: string;
  stage: string;
}

export const ChatInterfacePt = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Olá! Eu sou a Sky AI da Neo Gold. Qual é o seu nome?",
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo>({ stage: 'greeting' });
  const [showBookedModal, setShowBookedModal] = useState(false);
  const [appointmentLabel, setAppointmentLabel] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Show non-closable booking confirmation 6s after confirmation
  useEffect(() => {
    if (userInfo?.stage === 'confirmed' && (userInfo as any).appointmentLabel) {
      const label = (userInfo as any).appointmentLabel as string;
      const timer = setTimeout(() => {
        setAppointmentLabel(label);
        setShowBookedModal(true);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [userInfo]);

  const handleSendMessage = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat-with-ai-pt', {
        body: {
          message: text,
          conversationHistory: messages,
          userInfo: userInfo
        }
      });

      if (error) {
        console.error('Error calling AI function:', error);
        throw error;
      }

      // Mark user message as read
      setMessages(prev => 
        prev.map(msg => 
          msg.id === userMessage.id ? { ...msg, isRead: true } : msg
        )
      );

      // Handle multiple messages if the response was split
      const responses = Array.isArray(data.response) ? data.response : [data.response];
      
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        
        // Calculate delay based on message length (3-6 seconds)
        const messageLength = response.length;
        const delay = Math.min(Math.max(3000 + (messageLength * 30), 3000), 6000);
        
        // Wait for the calculated delay
        await new Promise(resolve => setTimeout(resolve, delay));

        const aiMessage: Message = {
          id: (Date.now() + i + 1).toString(),
          text: response,
          isUser: false,
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, aiMessage]);
        
        // Small delay between multiple messages
        if (i < responses.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      setUserInfo(data.userInfo);
      setIsTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Estou com problemas de conexão agora. Tente novamente em um momento!",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsTyping(false);
    }
  };

  return (
    <div className="h-screen bg-chat-background overflow-hidden">
      <div className="w-full h-full bg-white flex flex-col">
        {/* WhatsApp-style Header */}
        <div className="bg-chat-header px-4 py-3 flex items-center gap-3 border-b">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300">
            <img 
              src="/lovable-uploads/3cf65d32-ef25-48e7-a300-135847259b83.png" 
              alt="Sky AI" 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-white font-medium text-base">Sky AI</h1>
            <p className="text-white/70 text-xs">Online 24/7</p>
          </div>
        </div>

        {/* WhatsApp-style Messages Container */}
        <div 
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-chat-background"
          style={{ 
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'%3E%3Cg fill-opacity=\'0.03\'%3E%3Cpolygon fill=\'%23000\' points=\'50 0 60 40 100 50 60 60 50 100 40 60 0 50 40 40\'/%3E%3C/g%3E%3C/svg%3E")'
          }}
        >
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* WhatsApp-style Input Area */}
        <ChatInput onSendMessage={handleSendMessage} />

        {/* Non-closable booking confirmation modal */}
        <Dialog open={showBookedModal} onOpenChange={() => setShowBookedModal(true)}>
          <DialogContent className="sm:max-w-md select-none">
            <DialogHeader>
              <DialogTitle>Chamada agendada</DialogTitle>
              <DialogDescription>
                Sua conversa com nosso time está confirmada para {appointmentLabel}. Enviaremos um email de confirmação em instantes. Até breve!
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};