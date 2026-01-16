/**
 * Groq LLM Service
 * Uses Llama 3.3 70B for interview AI responses
 */

import Groq from 'groq-sdk';
import { config } from '../../lib/config.js';

const groq = new Groq({
  apiKey: config.GROQ_API_KEY,
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InterviewContext {
  jobRole: string;
  jobDescription?: string;
  candidateName?: string;
  companyName?: string;
}

/**
 * Generate the system prompt for the interview AI
 */
function buildSystemPrompt(context: InterviewContext): string {
  return `You are an AI interviewer conducting a professional job interview for a ${context.jobRole} position${context.companyName ? ` at ${context.companyName}` : ''}.

Your responsibilities:
1. Ask relevant technical and behavioral questions appropriate for the role
2. Follow up on candidate responses with clarifying questions when needed
3. Maintain a professional, friendly, and encouraging tone
4. Assess the candidate's skills, experience, and cultural fit
5. Keep responses concise (2-3 sentences) since this is a voice conversation

${context.jobDescription ? `Job Description:\n${context.jobDescription}\n` : ''}
${context.candidateName ? `Candidate Name: ${context.candidateName}` : ''}

Guidelines:
- Start by welcoming the candidate and briefly explaining the interview process
- Ask one question at a time
- Listen carefully and respond to what the candidate actually says
- Mix technical questions with behavioral questions (STAR method)
- Be respectful of time - aim for a focused, efficient interview
- At the end, thank the candidate and explain next steps

Remember: Keep responses SHORT and natural for voice conversation.`;
}

/**
 * Generate an AI response for the interview
 */
export async function generateResponse(
  context: InterviewContext,
  conversationHistory: ChatMessage[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ];

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 300, // Keep responses concise for voice
      top_p: 0.9,
    });

    return completion.choices[0]?.message?.content || 'I apologize, could you please repeat that?';
  } catch (error) {
    console.error('Groq LLM error:', error);
    throw error;
  }
}

/**
 * Generate the opening message for the interview
 */
export async function generateOpening(context: InterviewContext): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: 'Please start the interview with a brief welcome.',
    },
  ];

  return generateResponse(context, messages);
}

/**
 * Generate a closing message for the interview
 */
export async function generateClosing(
  context: InterviewContext,
  conversationHistory: ChatMessage[]
): Promise<string> {
  const messages: ChatMessage[] = [
    ...conversationHistory,
    {
      role: 'user',
      content: '[INTERVIEW ENDING] Please provide a brief closing statement thanking the candidate.',
    },
  ];

  return generateResponse(context, messages);
}

/**
 * Stream response for lower latency (if needed)
 */
export async function* streamResponse(
  context: InterviewContext,
  conversationHistory: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const systemPrompt = buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ];

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error('Groq LLM streaming error:', error);
    throw error;
  }
}
