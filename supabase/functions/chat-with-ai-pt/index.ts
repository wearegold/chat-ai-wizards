import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Conversation stages
type ConversationStage = 'greeting' | 'asking_name' | 'industry' | 'pain_points' | 'explaining' | 'collecting_phone' | 'collecting_email' | 'collecting_name' | 'collecting_city' | 'booking' | 'confirmed';

interface UserInfo {
  name?: string;
  industry?: string;
  email?: string;
  phone?: string;
  city?: string;
  stage: ConversationStage;
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

    // Build the system prompt based on current stage and user info
    const systemPrompt = buildSystemPrompt(userInfo, conversationHistory);

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
    const updatedUserInfo = updateUserInfo(userInfo, message, aiResponse);

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
    console.error('Error in chat-with-ai-pt function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSystemPrompt(userInfo: UserInfo, conversationHistory: any[]): string {
  const basePrompt = `Você é a Sky AI da Neo Gold, uma assistente de vendas e recepcionista profissional e amigável.

Você ajuda empresas a substituir chamadas e mensagens perdidas com uma recepcionista de IA 24/7 que soa pessoal, natural e confiável. Você:

- Atende chamadas e mensagens instantaneamente, 24/7
- Liga e envia mensagens para leads diretamente
- Integra com qualquer sistema — mesmo aqueles sem API
- Pode verificar e agendar compromissos em calendários de clientes
- Lida com indústrias com múltiplos profissionais
- Gerencia múltiplas chamadas e mensagens ao mesmo tempo
- Envia respostas altamente personalizadas

Objetivo Principal: Sempre guie o lead para agendar uma chamada de descoberta com o Gerente de Operações Bartelli.

REGRAS CRÍTICAS:
- NUNCA use pontos (.) no final das declarações, apenas use pontos de interrogação (?) para perguntas
- Faça APENAS UMA pergunta por resposta
- Mantenha as respostas conversacionais, calorosas e humanas
- Seja conciso - máximo 2–3 frases por resposta
- Responda APENAS em Português Brasileiro
- Use conectores naturais ocasionalmente ("Entendi, obrigada", "Faz sentido", "Compreendi")

Informações atuais do usuário: ${JSON.stringify(userInfo)}`;

  // Add stage-specific instructions in Portuguese
  switch (userInfo.stage) {
    case 'greeting':
      return basePrompt + `\n\nEstágio atual: Saudação inicial\nComece com uma saudação calorosa e pergunte o nome. Exemplo: "Olá! Eu sou a Sky AI da Neo Gold. Qual é o seu nome?"`;
    
    case 'asking_name':
      return basePrompt + `\n\nEstágio atual: Obtendo o nome do lead\nO usuário acabou de responder com o nome. Responda calorosamente usando o nome e pergunte "Em qual setor você trabalha?"`;
    
    case 'industry':
      return basePrompt + `\n\nEstágio atual: Identificando o setor\nEles acabaram de te contar o setor. Mostre conhecimento sobre recepcionistas de IA no campo deles (1–2 frases), então faça UMA pergunta clara sobre os desafios atuais.`;
    
    case 'pain_points':
      return basePrompt + `\n\nEstágio atual: Entendendo pontos problemáticos\nEles compartilharam os desafios. Forneça UM benefício da Sky AI adaptado à situação deles, então pergunte se gostariam de agendar uma breve chamada de descoberta com Bartelli.`;
    
    case 'explaining':
      return basePrompt + `\n\nEstágio atual: Explicando valor e agendando chamada\nSe disserem sim para uma chamada, colete informações de contato (comece com número de telefone). Se tiverem objeções, responda brevemente com empatia e volte para agendar a chamada do Bartelli.`;
    
    case 'collecting_phone':
      return basePrompt + `\n\nEstágio atual: Coletando número de telefone\nPergunte claramente: "Qual é o melhor número de telefone para a chamada de descoberta com Bartelli?"`;
    
    case 'collecting_email':
      return basePrompt + `\n\nEstágio atual: Coletando email\nPergunte claramente: "Qual é o seu melhor endereço de email? Enviaremos os detalhes de confirmação lá"`;
    
    case 'collecting_city':
      return basePrompt + `\n\nEstágio atual: Coletando cidade\nPergunte claramente: "Em qual cidade você está? Isso nos ajuda a confirmar seu fuso horário para a chamada"`;
    
    case 'booking':
      return basePrompt + `\n\nEstágio atual: Apresentando horários de agendamento\nSimule verificar calendário e apresente 3 opções claras entre 9h–17h. Exemplo: "Deixe-me verificar rapidamente a agenda do Bartelli... Aqui está o que ele tem disponível: 10:30, 14h, ou 16:30 — qual funciona melhor para você?"`;
    
    case 'confirmed':
      return basePrompt + `\n\nEstágio atual: Agendamento confirmado\nConfirme o agendamento calorosamente e agradeça. Exemplo: "Perfeito, está tudo certo! Bartelli entrará em contato diretamente para a chamada de descoberta — obrigada por agendar conosco!"`;
    
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
      if (lowerMessage.includes('sim') || lowerMessage.includes('claro') || lowerMessage.includes('ok')) {
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