import Groq from 'groq-sdk';
import { config } from '../../lib/config.js';

const groq = new Groq({
  apiKey: config.GROQ_API_KEY,
});

export interface InterviewMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface EvaluationResult {
  score: number; // 1-10
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendation: 'strong_hire' | 'hire' | 'maybe' | 'no_hire';
  technicalScore?: number;
  communicationScore?: number;
  problemSolvingScore?: number;
}

const EVALUATION_SYSTEM_PROMPT = `You are an expert interview evaluator. Analyze the following interview transcript and provide a comprehensive evaluation.

Your evaluation must be fair, objective, and based solely on the candidate's responses during the interview.

Return your evaluation as a JSON object with this exact structure:
{
  "score": <number 1-10>,
  "summary": "<2-3 sentence summary of the candidate's performance>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "improvements": ["<area for improvement 1>", "<area for improvement 2>", ...],
  "recommendation": "<one of: strong_hire, hire, maybe, no_hire>",
  "technicalScore": <number 1-10 or null if not applicable>,
  "communicationScore": <number 1-10>,
  "problemSolvingScore": <number 1-10 or null if not applicable>
}

Scoring guidelines:
- 9-10: Exceptional candidate, exceeds expectations
- 7-8: Strong candidate, meets all requirements
- 5-6: Adequate candidate, meets basic requirements
- 3-4: Below expectations, significant gaps
- 1-2: Does not meet minimum requirements

Be constructive in your feedback. Focus on specific examples from the transcript.`;

/**
 * Evaluate an interview transcript using AI
 */
export async function evaluateInterview(
  messages: InterviewMessage[],
  jobRole: string,
  additionalContext?: string
): Promise<EvaluationResult> {
  // Format transcript for evaluation
  const transcript = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${m.content}`)
    .join('\n\n');

  const userPrompt = `
Job Role: ${jobRole}
${additionalContext ? `Additional Context: ${additionalContext}\n` : ''}

Interview Transcript:
---
${transcript}
---

Please evaluate this interview and provide your assessment as JSON.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent evaluations
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No evaluation content received');
    }

    const evaluation = JSON.parse(content) as EvaluationResult;

    // Validate and clamp scores
    evaluation.score = Math.min(10, Math.max(1, Math.round(evaluation.score)));
    if (evaluation.technicalScore) {
      evaluation.technicalScore = Math.min(10, Math.max(1, Math.round(evaluation.technicalScore)));
    }
    if (evaluation.communicationScore) {
      evaluation.communicationScore = Math.min(10, Math.max(1, Math.round(evaluation.communicationScore)));
    }
    if (evaluation.problemSolvingScore) {
      evaluation.problemSolvingScore = Math.min(10, Math.max(1, Math.round(evaluation.problemSolvingScore)));
    }

    // Validate recommendation
    const validRecommendations = ['strong_hire', 'hire', 'maybe', 'no_hire'];
    if (!validRecommendations.includes(evaluation.recommendation)) {
      evaluation.recommendation = evaluation.score >= 7 ? 'hire' : evaluation.score >= 5 ? 'maybe' : 'no_hire';
    }

    // Ensure arrays
    evaluation.strengths = Array.isArray(evaluation.strengths) ? evaluation.strengths : [];
    evaluation.improvements = Array.isArray(evaluation.improvements) ? evaluation.improvements : [];

    return evaluation;
  } catch (error) {
    console.error('Interview evaluation error:', error);
    throw new Error('Failed to evaluate interview');
  }
}

/**
 * Generate a brief summary of an interview (lighter weight than full evaluation)
 */
export async function generateInterviewSummary(
  messages: InterviewMessage[],
  jobRole: string
): Promise<string> {
  const transcript = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${m.content}`)
    .join('\n\n');

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant', // Faster model for summaries
      messages: [
        {
          role: 'system',
          content: 'You are an expert at summarizing interview transcripts. Provide a concise 2-3 sentence summary highlighting the key points discussed and the candidate\'s main qualifications demonstrated.',
        },
        {
          role: 'user',
          content: `Job Role: ${jobRole}\n\nInterview Transcript:\n${transcript}\n\nProvide a brief summary:`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || 'Summary unavailable.';
  } catch (error) {
    console.error('Summary generation error:', error);
    return 'Summary generation failed.';
  }
}

/**
 * Generate interview questions based on job role and resume
 */
export async function generateInterviewQuestions(
  jobRole: string,
  resumeText?: string,
  questionCount: number = 5
): Promise<string[]> {
  const prompt = resumeText
    ? `Generate ${questionCount} tailored interview questions for a ${jobRole} position based on the following resume:\n\n${resumeText}`
    : `Generate ${questionCount} interview questions for a ${jobRole} position.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are an expert technical interviewer. Generate thoughtful, probing interview questions that assess both technical skills and soft skills. Return questions as a JSON array of strings.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return getDefaultQuestions(jobRole);
    }

    const parsed = JSON.parse(content);
    const questions = parsed.questions || parsed;

    if (Array.isArray(questions)) {
      return questions.slice(0, questionCount);
    }

    return getDefaultQuestions(jobRole);
  } catch (error) {
    console.error('Question generation error:', error);
    return getDefaultQuestions(jobRole);
  }
}

function getDefaultQuestions(jobRole: string): string[] {
  return [
    `Tell me about your experience relevant to the ${jobRole} position.`,
    'What interests you about this role and our company?',
    'Describe a challenging project you worked on and how you handled it.',
    'How do you stay current with industry trends and technologies?',
    'Where do you see yourself professionally in the next few years?',
  ];
}
