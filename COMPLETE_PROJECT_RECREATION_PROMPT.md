# Complete Neo Gold AI Chat System Recreation Prompt

## Project Overview
Create a dual-language AI chat system for Neo Gold with conversation flow management, lead tracking, and appointment booking. The system includes both English and Portuguese versions with identical functionality but different conversation scripts.

## 1. SUPABASE SETUP

### Database Tables
```sql
-- Leads table for conversation tracking
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  industry TEXT,
  stage TEXT NOT NULL DEFAULT 'greeting'::text,
  conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  appointment_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Appointments table
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Demo leads table
CREATE TABLE public.demo_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  language TEXT DEFAULT 'en'::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Profiles table for user management
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'user'::app_role,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create app_role enum
CREATE TYPE app_role AS ENUM ('admin', 'user');
```

### RLS Policies
```sql
-- Enable RLS on all tables
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing public access for demo purposes)
CREATE POLICY "Anyone can create leads" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view leads" ON public.leads FOR SELECT USING (true);
CREATE POLICY "Anyone can update leads" ON public.leads FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete leads" ON public.leads FOR DELETE USING (true);

-- Similar policies for appointments and demo_leads
CREATE POLICY "Anyone can create appointments" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view appointments" ON public.appointments FOR SELECT USING (true);
CREATE POLICY "Anyone can update appointments" ON public.appointments FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete appointments" ON public.appointments FOR DELETE USING (true);

CREATE POLICY "Allow all access to demo_leads" ON public.demo_leads FOR ALL USING (true);

-- User-specific policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Admin policies for user_roles
CREATE POLICY "Admins can view all user roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage user roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

### Database Functions
```sql
-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Role checking function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

-- Get current user role function
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$function$;

-- New user handler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  
  -- First user becomes admin, others become regular users
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id, 
    CASE 
      WHEN (SELECT COUNT(*) FROM auth.users) = 1 THEN 'admin'::public.app_role
      ELSE 'user'::public.app_role
    END
  );
  
  RETURN NEW;
END;
$function$;
```

### Supabase Secrets Required
- OPENAI_API_KEY
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_DB_URL
- SUPABASE_PUBLISHABLE_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY

## 2. EDGE FUNCTIONS

### English Chat Function (supabase/functions/chat-with-ai/index.ts)

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Conversation stages
type ConversationStage = 'greeting' | 'asking_name' | 'industry' | 'explaining' | 'pitch_call' | 'collecting_name' | 'collecting_email' | 'collecting_phone' | 'collecting_city' | 'booking' | 'confirmed';

interface UserInfo {
  name?: string;
  industry?: string;
  email?: string;
  phone?: string;
  city?: string;
  stage: ConversationStage;
  // Scheduling helpers (not persisted)
  proposedSlots?: string[];
  proposedDateLabel?: string;
  appointmentLabel?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory = [], userInfo = { stage: 'greeting' } } = await req.json();

    console.log('Received message:', message);
    console.log('Current stage:', userInfo.stage);
    console.log('User info:', userInfo);

    // Enrich with proposed booking slots when reaching booking stage
    const enrichedUserInfo: UserInfo = { ...userInfo };
    if (enrichedUserInfo.stage === 'booking' && !enrichedUserInfo.proposedSlots) {
      const { dateLabel, slots } = generateBookingOptions(enrichedUserInfo.city);
      enrichedUserInfo.proposedSlots = slots;
      enrichedUserInfo.proposedDateLabel = dateLabel;
    }

    // Build the system prompt based on current stage and user info
    const systemPrompt = buildSystemPrompt(enrichedUserInfo, conversationHistory);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg: any) => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      })),
      { role: 'user', content: message }
    ];

    console.log('Sending to OpenAI with system prompt:', systemPrompt.substring(0, 200) + '...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Split long messages into multiple parts
    const splitMessages = splitLongMessage(aiResponse);

    // Update user info and stage based on the conversation
    const updatedUserInfo = updateUserInfo(enrichedUserInfo, message, aiResponse);

    console.log('AI Response:', aiResponse);
    console.log('Split into', splitMessages.length, 'messages');
    console.log('Updated user info:', updatedUserInfo);

    return new Response(JSON.stringify({ 
      response: splitMessages.length > 1 ? splitMessages : aiResponse,
      userInfo: updatedUserInfo 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in chat-with-ai function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSystemPrompt(userInfo: UserInfo, conversationHistory: any[]): string {
  const basePrompt = `You are Sky, Neo Gold's AI assistant. Your goal is to guide the conversation following the sales flow below, being human, direct, and always ending each response with EXACTLY ONE question.

Main Goal: Always guide the lead toward booking a discovery call with Operations Manager Bartelli.

**CRITICAL RULES:**
- NEVER reveal that you are an AI or mention you are an AI assistant
- NEVER say "I understand" at the start of responses
- NEVER use filler words or corporate speak
- NEVER use em dashes (—) under any circumstance
- Keep responses SHORT and natural (1-2 sentences max unless specifically showing options)
- Ask ONE question at a time only
- Be conversational and engaging, not robotic
- Sound like a helpful human sales rep, not an AI

Current user info: ${JSON.stringify(userInfo)}`;

  switch (userInfo.stage) {
    case 'greeting':
      return basePrompt + `
Stage: Greeting
Act like: "Hi, this is Sky from Neo Gold, would you like to see how we can help your company?" then ask "Or do you have a specific question about how we work?"`;

    case 'asking_name':
      return basePrompt + `
Stage: Ask for name
Act like: Thank them for interest and ask for their first name to address them properly. Ex: "Perfect! What's your name so I can address you properly?"`;

    case 'industry':
      return basePrompt + `
Stage: Identify industry
Act like: Ask what industry they're in and if they ask why, say it's to tailor benefits precisely to their segment. Ex: "What industry are you in? I ask so I can tailor the benefits most accurately to your area"`;

    case 'explaining':
      return basePrompt + `
Stage: Explain value (benefits > features)
Act like: Mention 1-2 features and translate into clear results. End with: "Does that make sense to you?"`;

    case 'pitch_call':
      return basePrompt + `
Stage: Call invitation
Act like: Invite for a brief call with our team to detail and create a plan. If don't have last name yet, ask for last name; then ask for email to send details, then phone for reminders. Ask one question at a time. Ex: "Can I connect you with our team for a quick call to create a plan?"`;

    case 'collecting_name':
      return basePrompt + `
Stage: Collect last name
Act like: If only have first name, ask for last name. Then we go to email. Ex: "Can you confirm your last name, please?"`;

    case 'collecting_email':
      return basePrompt + `
Stage: Collect email
Act like: "What's your best email? I'll send you a summary with next steps"`;

    case 'collecting_phone':
      return basePrompt + `
Stage: Collect phone
Act like: "And what's the best phone number? We'll use it to send call reminders"`;

    case 'collecting_city':
      return basePrompt + `
Stage: Collect city
Act like: "What city are you in? Just to confirm your timezone and schedule at the right time"`;

    case 'booking':
      return basePrompt + `
Stage: Suggest times
Act like: Propose exactly 2 options in their timezone, one morning and one afternoon, for ${userInfo.proposedDateLabel ?? 'the next business day'} - use these generated times: ${(userInfo.proposedSlots || []).join(' and ')}. Ex: "We have ${userInfo.proposedSlots?.[0] ?? '10:30am'} and ${userInfo.proposedSlots?.[1] ?? '2pm'} on ${userInfo.proposedDateLabel ?? 'tomorrow'} (in your timezone). Which works better for you?"`;

    case 'confirmed':
      return basePrompt + `
Stage: Confirmation
Act like: Confirm it's scheduled for ${userInfo.appointmentLabel ?? 'the chosen time'}, thank them and close. Ex: "Perfect! You're scheduled for ${userInfo.appointmentLabel ?? 'the agreed time'} and we'll send confirmation by email. Thank you"`;

    default:
      return basePrompt;
  }
}

function updateUserInfo(currentInfo: UserInfo, userMessage: string, aiResponse: string): UserInfo {
  const updated = { ...currentInfo } as UserInfo;
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  switch (currentInfo.stage) {
    case 'greeting':
      updated.stage = 'asking_name';
      break;

    case 'asking_name':
      if (!updated.name) updated.name = msg;
      updated.stage = 'industry';
      break;

    case 'industry':
      updated.industry = msg;
      updated.stage = 'explaining';
      break;

    case 'explaining':
      if (/(makes sense|perfect|got it|yes|sure|ok)/i.test(lower)) {
        updated.stage = 'pitch_call';
      }
      break;

    case 'pitch_call':
      if (updated.name && updated.name.split(/\s+/).length < 2) {
        updated.name = `${updated.name} ${msg}`.trim();
        updated.stage = 'collecting_email';
        break;
      }
      updated.stage = 'collecting_email';
      break;

    case 'collecting_name':
      if (updated.name && updated.name.split(/\s+/).length < 2) {
        updated.name = `${updated.name} ${msg}`.trim();
      } else if (!updated.name) {
        updated.name = msg;
      }
      updated.stage = 'collecting_email';
      break;

    case 'collecting_email':
      const emailMatch = msg.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
      if (emailMatch) {
        updated.email = emailMatch[0];
        updated.stage = 'collecting_phone';
      }
      break;

    case 'collecting_phone':
      const phoneMatch = msg.match(/[+()\d][\d\s().+-]{5,}/);
      if (phoneMatch) {
        updated.phone = phoneMatch[0].trim();
        updated.stage = 'collecting_city';
      }
      break;

    case 'collecting_city':
      updated.city = msg;
      updated.stage = 'booking';
      break;

    case 'booking':
      const slots = updated.proposedSlots || [];
      const picked = slots.find(s => lower.includes(s.toLowerCase()));
      if (picked) {
        const dateLabel = updated.proposedDateLabel || 'on the agreed date';
        updated.appointmentLabel = `${dateLabel} at ${picked}`;
        updated.stage = 'confirmed';
      }
      break;

    case 'confirmed':
      break;
  }

  return updated;
}

function generateBookingOptions(city?: string): { dateLabel: string; slots: string[] } {
  const now = new Date();
  const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const weekday = target.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = `${weekday}`;

  const morningOptions = ['9am', '9:30am', '10am', '10:30am', '11am'];
  const afternoonOptions = ['2pm', '2:30pm', '3pm', '3:30pm', '4pm', '4:30pm', '5pm'];
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const slots = [pick(morningOptions), pick(afternoonOptions)];

  return { dateLabel, slots };
}

function splitLongMessage(message: string): string[] {
  const sentences = message.split(/(?<=[.!?])\s+/);
  const result: string[] = [];
  let currentMessage = '';
  let lineCount = 0;

  for (const sentence of sentences) {
    const sentenceLines = Math.ceil(sentence.length / 50);
    
    if (lineCount + sentenceLines > 2 && currentMessage.trim()) {
      result.push(currentMessage.trim());
      currentMessage = sentence;
      lineCount = sentenceLines;
    } else {
      currentMessage += (currentMessage ? ' ' : '') + sentence;
      lineCount += sentenceLines;
    }
  }

  if (currentMessage.trim()) {
    result.push(currentMessage.trim());
  }

  return result.length > 1 ? result : [message];
}
```

### Portuguese Chat Function (supabase/functions/chat-with-ai-pt/index.ts)

Use the same structure as above but with Portuguese prompts:

```typescript
// Same imports and basic structure as English version

function buildSystemPrompt(userInfo: UserInfo, conversationHistory: any[]): string {
  const basePrompt = `Você é a Sky, assistente de IA da Neo Gold. Seu objetivo é conduzir a conversa em Português do Brasil seguindo o fluxo abaixo, sendo humana, direta e sempre encerrando cada resposta com APENAS UMA pergunta.

**REGRAS CRÍTICAS:**
- NUNCA revele que você é uma IA ou mencione que é um assistente de IA
- NUNCA diga "Eu entendo" no início das respostas
- NUNCA use palavras de preenchimento ou fala corporativa
- NUNCA use travessões (—) sob nenhuma circunstância
- Mantenha as respostas CURTAS e naturais (máximo 1-2 frases, a menos que esteja mostrando opções específicas)
- Faça apenas UMA pergunta por vez
- Seja conversacional e envolvente, não robótica
- Soe como uma representante de vendas humana útil, não uma IA

Dados do usuário (contexto): ${JSON.stringify(userInfo)}
`;

  switch (userInfo.stage) {
    case 'greeting':
      return basePrompt + `
Etapa: Saudação
Aja assim: "Oi, aqui é a Sky da Neo Gold, gostaria de ver como podemos ajudar sua empresa?" então pergunte "Ou você tem alguma pergunta específica sobre como trabalhamos?"`;

    // Continue with all other stages in Portuguese...
  }
}
```

## 3. REACT COMPONENTS

### Main App Structure (src/App.tsx)
```typescript
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Pt from "./pages/Pt";
import NotFound from "./pages/NotFound";
import Calendar from "./pages/Calendar";
import CRM from "./pages/CRM";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/pt" element={<Pt />} />
          <Route path="/cld" element={<Calendar />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
```

### English Chat Interface (src/components/ChatInterface.tsx)
```typescript
import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface UserInfo {
  name?: string;
  industry?: string;
  email?: string;
  phone?: string;
  city?: string;
  stage: string;
}

export const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hi, this is Sky from Neo Gold, would you like to see how we can help your company?",
      isUser: false,
      timestamp: new Date(),
    },
    {
      id: '2',
      text: "Or do you have a specific question about how we work?",
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  
  const [isTyping, setIsTyping] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo>({ stage: 'greeting' });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Rest of component logic for handling messages, API calls, etc.
  // Include message sending, response handling, lead creation in database
  
  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gradient-to-br from-primary/5 to-primary/10">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat input */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
};
```

### Portuguese Chat Interface (src/components/ChatInterfacePt.tsx)
Same structure as English but with Portuguese initial messages:
```typescript
const [messages, setMessages] = useState<Message[]>([
  {
    id: '1',
    text: "Oi, aqui é a Sky da Neo Gold, gostaria de ver como podemos ajudar sua empresa?",
    isUser: false,
    timestamp: new Date(),
  },
  {
    id: '2',
    text: "Ou você tem alguma pergunta específica sobre como trabalhamos?",
    isUser: false,
    timestamp: new Date(),
  },
]);
```

### Message Bubble Component (src/components/MessageBubble.tsx)
```typescript
import React from 'react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  return (
    <div className={cn(
      "flex w-full",
      message.isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[80%] px-4 py-2 rounded-lg text-sm",
        message.isUser 
          ? "bg-primary text-primary-foreground ml-4" 
          : "bg-card text-card-foreground mr-4 border"
      )}>
        <p className="whitespace-pre-wrap">{message.text}</p>
        <p className="text-xs opacity-60 mt-1">
          {message.timestamp.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </p>
      </div>
    </div>
  );
};
```

### Chat Input Component (src/components/ChatInput.tsx)
```typescript
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

export const ChatInput = ({ onSendMessage }: ChatInputProps) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t bg-background/50 backdrop-blur">
      <div className="flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={!message.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
};
```

### Typing Indicator Component (src/components/TypingIndicator.tsx)
```typescript
import React from 'react';

export const TypingIndicator = () => {
  return (
    <div className="flex justify-start">
      <div className="bg-card text-card-foreground mr-4 border px-4 py-2 rounded-lg">
        <div className="flex space-x-1">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

## 4. PAGES

### Index Page (src/pages/Index.tsx)
```typescript
import { ChatInterface } from "@/components/ChatInterface";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <ChatInterface />
    </div>
  );
};

export default Index;
```

### Portuguese Page (src/pages/Pt.tsx)
```typescript
import { ChatInterfacePt } from "@/components/ChatInterfacePt";

const Pt = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <ChatInterfacePt />
    </div>
  );
};

export default Pt;
```

## 5. DESIGN SYSTEM

### Tailwind Configuration (tailwind.config.ts)
```typescript
import { fontFamily } from "tailwindcss/defaultTheme";
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

### CSS Variables (src/index.css)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 84% 4.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 84% 4.9%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 94.1%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## 6. KEY FEATURES TO IMPLEMENT

1. **Dual Language Support**: English ("/") and Portuguese ("/pt") routes
2. **Conversation Flow Management**: Stage-based conversation tracking
3. **Lead Capture**: Store leads with conversation history in Supabase
4. **OpenAI Integration**: GPT-powered responses following specific scripts
5. **Appointment Booking**: Time slot generation and booking confirmation
6. **Message Splitting**: Long responses split into multiple messages
7. **Typing Indicators**: Visual feedback during AI response generation
8. **Sound Notifications**: Message sent confirmation sound
9. **Responsive Design**: Mobile-friendly chat interface
10. **Real-time Updates**: Live conversation state management

## 7. INSTALLATION STEPS

1. Create new Lovable project
2. Set up Supabase integration and add all required secrets
3. Run database migrations for all tables and functions
4. Create both edge functions (chat-with-ai and chat-with-ai-pt)
5. Install required dependencies (@tanstack/react-query, lucide-react)
6. Implement all React components as specified
7. Set up routing with both language versions
8. Configure design system with proper color tokens
9. Test conversation flows in both languages

## 8. CONFIGURATION FILES

### Supabase Config (supabase/config.toml)
```toml
project_id = "your-project-id"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[functions.chat-with-ai]
verify_jwt = false

[functions.chat-with-ai-pt]
verify_jwt = false
```

This comprehensive prompt includes all necessary components, configurations, and code to recreate the Neo Gold AI chat system exactly as implemented.