import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

// Conversation stages
type ConversationStage = 'greeting' | 'asking_name' | 'industry' | 'explaining' | 'pitch_call' | 'collecting_name' | 'collecting_email' | 'collecting_phone' | 'collecting_city' | 'booking' | 'confirmed';

interface UserInfo {
  name?: string;
  industry?: string;
  email?: string;
  phone?: string;
  city?: string;
  stage: ConversationStage;
  leadId?: string;
  // Scheduling helpers (not persisted):
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

    // Save/update lead in database
    const updatedUserInfo = await saveOrUpdateLead(userInfo, message, conversationHistory);

    // Enrich with proposed booking slots when reaching booking stage
    const enrichedUserInfo: UserInfo = { ...updatedUserInfo };
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
    const finalUserInfo = updateUserInfo(enrichedUserInfo, message, aiResponse);

    // Update lead in database with final info
    await updateLeadConversation(finalUserInfo, conversationHistory, message, aiResponse);

    console.log('AI Response:', aiResponse);
    console.log('Split into', splitMessages.length, 'messages');
    console.log('Updated user info:', finalUserInfo);

    return new Response(JSON.stringify({ 
      response: splitMessages.length > 1 ? splitMessages : aiResponse,
      userInfo: finalUserInfo 
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

async function saveOrUpdateLead(userInfo: UserInfo, message: string, conversationHistory: any[]): Promise<UserInfo> {
  try {
    // Extract info from current stage
    const updatedInfo = { ...userInfo };
    const lowerMessage = message.toLowerCase();

    // Update stage-specific information
    switch (userInfo.stage) {
      case 'industry':
        updatedInfo.industry = message.trim();
        updatedInfo.stage = 'asking_name';
        break;
      case 'asking_name':
        updatedInfo.name = message.trim();
        updatedInfo.stage = 'pain_points';
        break;
      case 'collecting_phone':
        const phoneMatch = message.match(/[\d\s\-\(\)\+]+/);
        if (phoneMatch) {
          updatedInfo.phone = phoneMatch[0].trim();
          updatedInfo.stage = 'collecting_email';
        }
        break;
      case 'collecting_email':
        const emailMatch = message.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
        if (emailMatch) {
          updatedInfo.email = emailMatch[0];
          updatedInfo.stage = 'collecting_name';
        }
        break;
      case 'collecting_name':
        if (!updatedInfo.name) {
          updatedInfo.name = message.trim();
        }
        updatedInfo.stage = 'collecting_city';
        break;
      case 'collecting_city':
        updatedInfo.city = message.trim();
        updatedInfo.stage = 'booking';
        break;
    }

    // Save lead if we have at least email or phone
    if ((updatedInfo.email || updatedInfo.phone) && !updatedInfo.leadId) {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          name: updatedInfo.name,
          email: updatedInfo.email,
          phone: updatedInfo.phone,
          industry: updatedInfo.industry,
          stage: updatedInfo.stage,
          conversation_history: conversationHistory
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating lead:', error);
      } else {
        updatedInfo.leadId = data.id;
        console.log('Created lead with ID:', data.id);
      }
    } else if (updatedInfo.leadId) {
      // Update existing lead
      const { error } = await supabase
        .from('leads')
        .update({
          name: updatedInfo.name,
          email: updatedInfo.email,
          phone: updatedInfo.phone,
          industry: updatedInfo.industry,
          stage: updatedInfo.stage,
          conversation_history: conversationHistory
        })
        .eq('id', updatedInfo.leadId);

      if (error) {
        console.error('Error updating lead:', error);
      }
    }

    return updatedInfo;
  } catch (error) {
    console.error('Error in saveOrUpdateLead:', error);
    return userInfo;
  }
}

async function updateLeadConversation(userInfo: UserInfo, conversationHistory: any[], userMessage: string, aiResponse: string) {
  if (!userInfo.leadId) return;

  try {
    const updatedHistory = [
      ...conversationHistory,
      { text: userMessage, isUser: true, timestamp: new Date() },
      { text: aiResponse, isUser: false, timestamp: new Date() }
    ];

    await supabase
      .from('leads')
      .update({
        conversation_history: updatedHistory,
        stage: userInfo.stage
      })
      .eq('id', userInfo.leadId);
  } catch (error) {
    console.error('Error updating conversation history:', error);
  }
}

async function checkAvailableSlots(date: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('start_time, end_time')
      .eq('date', date);

    if (error) {
      console.error('Error checking appointments:', error);
      return ['10:30am', '2:00pm', '4:30pm']; // Fallback times
    }

    // Get booked times
    const bookedTimes = data?.map(apt => apt.start_time) || [];
    
    // Available slots (simplified)
    const allSlots = ['09:00', '10:30', '14:00', '16:30'];
    const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
    
    // Convert to display format
    return availableSlots.map(slot => {
      const [hour, minute] = slot.split(':');
      const hourNum = parseInt(hour);
      const ampm = hourNum >= 12 ? 'pm' : 'am';
      const displayHour = hourNum > 12 ? hourNum - 12 : hourNum;
      return `${displayHour}:${minute}${ampm}`;
    }).slice(0, 3);
  } catch (error) {
    console.error('Error in checkAvailableSlots:', error);
    return ['10:30am', '2:00pm', '4:30pm'];
  }
}

function buildSystemPrompt(userInfo: UserInfo, conversationHistory: any[]): string {
  const basePrompt = `You are Sky AI from Neo Gold, a friendly professional receptionist sales assistant.

You help businesses replace missed calls and messages with a 24/7 AI receptionist that sounds personal, natural, and reliable. You:

- Answer calls and messages instantly, 24/7
- Call and text leads directly
- Integrate with any system — even those without an API
- Can check and book appointments in client calendars
- Handle industries with multiple professionals
- Manage multiple calls and messages at once
- Send highly personalized responses

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

  // Add stage-specific instructions
  switch (userInfo.stage) {
    case 'greeting':
      return basePrompt + `\n\nCurrent stage: Initial greeting\nStart with a warm greeting and ask for their name. Example: "Hi there! I'm Sky AI from Neo Gold. What's your name?"`;
    
    case 'asking_name':
      return basePrompt + `\n\nCurrent stage: Getting the lead's name\nThe user just replied with their name. Respond warmly using their name and ask "Which industry are you in?"`;
    
    case 'industry':
      return basePrompt + `\n\nCurrent stage: Identifying their industry\nThey just told you their industry. Show short expertise about AI receptionists in their field (1–2 sentences), then ask ONE clear question about their current challenges.`;
    
    case 'pain_points':
      return basePrompt + `\n\nCurrent stage: Understanding pain points\nThey've shared their challenges. Provide ONE benefit of Sky AI tailored to their situation, then ask if they'd like to book a short discovery call with Bartelli.`;
    
    case 'explaining':
      return basePrompt + `\n\nCurrent stage: Explaining value and booking call\nIf they say yes to a call, collect contact info (start with phone number). If they have objections, respond briefly with empathy and pivot back to scheduling Bartelli's call.`;
    
    case 'collecting_phone':
      return basePrompt + `\n\nCurrent stage: Collecting phone number\nAsk clearly: "What's the best phone number for the discovery call with Bartelli?"`;
    
    case 'collecting_email':
      return basePrompt + `\n\nCurrent stage: Collecting email\nAsk clearly: "What's your best email address? We'll send the confirmation details there"`;
    
    case 'collecting_city':
      return basePrompt + `\n\nCurrent stage: Collecting city\nAsk clearly: "Which city are you in? This helps us confirm your time zone for the call"`;
    
    case 'booking':
      return basePrompt + `\n\nCurrent stage: Presenting appointment slots\nSimulate checking calendar and present 3 clear time options between 9am–5pm. Example: "Let me quickly check Bartelli's calendar... Here's what he has open: 10:30am, 2pm, or 4:30pm — which works best for you?"`;
    
    case 'confirmed':
      return basePrompt + `\n\nCurrent stage: Appointment confirmed\nConfirm their appointment warmly and thank them. Example: "Perfect, you're all set! Bartelli will contact you directly for the discovery call — thanks for booking with us!"`;
    
    default:
      return basePrompt;
  }
}

function updateUserInfo(currentInfo: UserInfo, userMessage: string, aiResponse: string): UserInfo {
  const updatedInfo = { ...currentInfo };
  const lowerMessage = userMessage.toLowerCase();

  // Extract information and update stage
  switch (currentInfo.stage) {
    case 'greeting':
      updatedInfo.stage = 'asking_name';
      break;
    
    case 'asking_name':
      // Extract name from user message
      updatedInfo.name = userMessage.trim();
      updatedInfo.stage = 'industry';
      break;
    
    case 'industry':
      updatedInfo.industry = userMessage.trim();
      updatedInfo.stage = 'pain_points';
      break;
    
    case 'pain_points':
      updatedInfo.stage = 'explaining';
      break;
    
    case 'explaining':
      if (lowerMessage.includes('yes') || lowerMessage.includes('sure') || lowerMessage.includes('okay')) {
        updatedInfo.stage = 'collecting_phone';
      }
      break;
    
    case 'collecting_phone':
      // Extract phone number
      const phoneMatch = userMessage.match(/[\d\s\-\(\)\+]+/);
      if (phoneMatch) {
        updatedInfo.phone = phoneMatch[0].trim();
        updatedInfo.stage = 'collecting_email';
      }
      break;
    
    case 'collecting_email':
      // Extract email
      const emailMatch = userMessage.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
      if (emailMatch) {
        updatedInfo.email = emailMatch[0];
        updatedInfo.stage = 'collecting_city';
      }
      break;
    
    case 'collecting_city':
      updatedInfo.city = userMessage.trim();
      updatedInfo.stage = 'booking';
      break;
    
    case 'booking':
      updatedInfo.stage = 'confirmed';
      break;
  }

  return updatedInfo;
}

function splitLongMessage(message: string): string[] {
  // Split by sentences first
  const sentences = message.split(/(?<=[.!?])\s+/);
  const result: string[] = [];
  let currentMessage = '';
  let lineCount = 0;

  for (const sentence of sentences) {
    const sentenceLines = Math.ceil(sentence.length / 50); // Approximate characters per line
    
    if (lineCount + sentenceLines > 2 && currentMessage.trim()) {
      // Current message would exceed 2 lines, split here
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