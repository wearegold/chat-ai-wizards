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
    console.error('Error in chat-with-ai-pt function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSystemPrompt(userInfo: UserInfo, conversationHistory: any[]): string {
  const basePrompt = `Você é a Sky, assistente de IA da Neo Gold. Seu objetivo é conduzir a conversa em Português do Brasil seguindo o fluxo abaixo, sendo humana, direta e sempre encerrando cada resposta com APENAS UMA pergunta.

Regras:
- Responda SEMPRE em Português Brasileiro
- Seja concisa: 1–2 frases, no máximo 3
- Faça APENAS UMA pergunta por resposta
- Foque em benefícios do negócio, cite no máximo 1–2 recursos como suporte
- Tom caloroso e profissional

Dados do usuário (contexto): ${JSON.stringify(userInfo)}
`;

  switch (userInfo.stage) {
    case 'greeting':
      // 1 e 1.5
      return basePrompt + `
Etapa: Saudação
Aja assim: "Oi, aqui é a Sky, da Neo Gold — como posso te ajudar hoje? Posso te mostrar rapidamente como ajudamos a sua empresa?"`;

    case 'asking_name':
      return basePrompt + `
Etapa: Perguntar nome
Aja assim: Agradeça o interesse e peça o primeiro nome para falar direitinho. Ex: "Perfeito — qual é o seu nome para eu te chamar direitinho?"`;

    case 'industry':
      // 2
      return basePrompt + `
Etapa: Identificar o setor
Aja assim: Pergunte em qual setor atuam e, se perguntarem por quê, diga que é para adaptar os benefícios com precisão ao segmento deles. Ex: "Em qual setor você atua? Pergunto para adaptar os benefícios do jeito mais certeiro para a sua área"`;

    case 'explaining':
      // 3 e 4
      return basePrompt + `
Etapa: Explicar valor (benefícios > recursos)
Aja assim: Cite 1–2 recursos e traduza em resultados claros. Termine com: "Faz sentido para você?"`;

    case 'pitch_call':
      // 5 e 6 (início)
      return basePrompt + `
Etapa: Convite para a chamada
Aja assim: Convide para uma breve chamada com nosso time para detalhar e montar um plano. Se ainda não tiver sobrenome, peça o sobrenome; depois peça o email para enviar detalhes e, em seguida, o telefone para lembretes. Faça uma pergunta por vez. Ex: "Posso te conectar com nosso time para uma chamada rápida e montarmos um plano?"`;

    case 'collecting_name':
      return basePrompt + `
Etapa: Coletar sobrenome
Aja assim: Se só tiver o primeiro nome, peça o sobrenome. Depois vamos para o email. Ex: "Pode me confirmar seu sobrenome, por favor?"`;

    case 'collecting_email':
      return basePrompt + `
Etapa: Coletar email
Aja assim: "Qual é o seu melhor email? Vou te enviar um resumo com os próximos passos"`;

    case 'collecting_phone':
      return basePrompt + `
Etapa: Coletar telefone
Aja assim: "E qual é o melhor número de telefone? Usaremos para enviar lembretes da chamada"`;

    case 'collecting_city':
      // 7
      return basePrompt + `
Etapa: Coletar cidade
Aja assim: "Qual cidade você está? É só para confirmar seu fuso e agendar no horário certo"`;

    case 'booking':
      // 8 — propor 2 horários (manhã e tarde) para a data >= 24h
      return basePrompt + `
Etapa: Sugerir horários
Aja assim: Proponha exatamente 2 opções no seu fuso horário, uma pela manhã e outra à tarde, para ${userInfo.proposedDateLabel ?? 'o próximo dia útil'} — use estes horários gerados: ${(userInfo.proposedSlots || []).join(' e ')}. Ex: "Temos ${userInfo.proposedSlots?.[0] ?? '10h30'} e ${userInfo.proposedSlots?.[1] ?? '14h'} em ${userInfo.proposedDateLabel ?? 'amanhã'} (no seu fuso). Qual fica melhor para você?"`;

    case 'confirmed':
      // 8 (final)
      return basePrompt + `
Etapa: Confirmação
Aja assim: Confirme que está agendado para ${userInfo.appointmentLabel ?? 'o horário escolhido'}, agradeça e encerre. Ex: "Perfeito — você está agendad@ para ${userInfo.appointmentLabel ?? 'o horário combinado'} e enviaremos a confirmação por email. Obrigada"`;

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
      // Após a saudação, seguimos para pedir o nome
      updated.stage = 'asking_name';
      break;

    case 'asking_name':
      // Guarda o nome informado
      if (!updated.name) updated.name = msg;
      updated.stage = 'industry';
      break;

    case 'industry':
      updated.industry = msg;
      updated.stage = 'explaining';
      break;

    case 'explaining':
      // Se fizer sentido, avançamos; se vier pergunta, o prompt tratará e manterá a etapa
      if (/(faz sentido|perfeito|entendi|sim|claro|ok)/i.test(lower)) {
        updated.stage = 'pitch_call';
      }
      break;

    case 'pitch_call':
      // Passo 6: coletar sobrenome se não tiver ainda
      if (updated.name && updated.name.split(/\s+/).length < 2) {
        // usuário deve estar respondendo com sobrenome
        updated.name = `${updated.name} ${msg}`.trim();
        updated.stage = 'collecting_email';
        break;
      }
      // se já tem nome completo, pedir email
      updated.stage = 'collecting_email';
      break;

    case 'collecting_name':
      // Garantir nome completo neste passo
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
      // Escolha de um dos horários propostos
      const slots = updated.proposedSlots || [];
      const picked = slots.find(s => lower.includes(s.toLowerCase()));
      if (picked) {
        const dateLabel = updated.proposedDateLabel || 'na data combinada';
        updated.appointmentLabel = `${dateLabel} às ${picked}`;
        updated.stage = 'confirmed';
      }
      break;

    case 'confirmed':
      // Fica como está
      break;
  }

  return updated;
}

function generateBookingOptions(city?: string): { dateLabel: string; slots: string[] } {
  // Define a data pelo menos 24h à frente (mantemos simples, sem fuso real)
  const now = new Date();
  const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Label amigável do dia (ex: sexta-feira)
  const weekday = target.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dateLabel = `${weekday}`; // poderíamos incluir a data também, mas mantemos curto

  // Sorteia um horário de manhã e um à tarde
  const morningOptions = ['9h', '9h30', '10h', '10h30', '11h'];
  const afternoonOptions = ['14h', '14h30', '15h', '15h30', '16h', '16h30', '17h'];
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const slots = [pick(morningOptions), pick(afternoonOptions)];

  return { dateLabel, slots };
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