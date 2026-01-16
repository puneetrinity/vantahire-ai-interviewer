/**
 * Voice Interview WebSocket Handler
 * Pipeline: Audio In → Deepgram STT → Groq LLM → Deepgram/Cartesia TTS → Audio Out
 */

import type { WSContext, WSMessageReceive } from 'hono/ws';
import { db } from '../../lib/db.js';
import { emitTo } from '../../lib/socket.js';
import { DeepgramSTT, type TranscriptEvent } from './stt.js';
import { generateResponse, generateOpening, type ChatMessage, type InterviewContext } from './llm.js';
import { createTTSProvider, type TTSProvider } from './tts.js';

interface VoiceSession {
  interviewId: string;
  stt: DeepgramSTT;
  tts: TTSProvider;
  context: InterviewContext;
  conversationHistory: ChatMessage[];
  isProcessing: boolean;
  pendingTranscript: string;
}

const activeSessions = new Map<string, VoiceSession>();

/**
 * Creates a WebSocket handler for voice interviews
 */
export function createVoiceHandler(interviewId: string) {
  return {
    onOpen: async (_evt: Event, ws: WSContext) => {
      console.log(`Voice session opened for interview: ${interviewId}`);

      // Fetch interview details
      const interview = await db.interview.findUnique({
        where: { id: interviewId },
        include: {
          job: { select: { description: true } },
          recruiter: {
            include: {
              recruiterProfile: { select: { companyName: true } },
            },
          },
        },
      });

      if (!interview || interview.type !== 'VOICE') {
        ws.close(4000, 'Invalid interview');
        return;
      }

      if (interview.status !== 'IN_PROGRESS' && interview.status !== 'PENDING') {
        ws.close(4001, 'Interview not active');
        return;
      }

      // Build interview context for LLM
      const context: InterviewContext = {
        jobRole: interview.jobRole,
        jobDescription: interview.job?.description || undefined,
        candidateName: interview.candidateName || undefined,
        companyName: interview.recruiter.recruiterProfile?.companyName || undefined,
      };

      // Initialize TTS provider
      const tts = createTTSProvider();

      // Initialize STT with callbacks
      const stt = new DeepgramSTT({
        onTranscript: (event) => handleTranscript(interviewId, event, ws),
        onError: (error) => {
          console.error(`STT error for interview ${interviewId}:`, error);
          ws.send(JSON.stringify({ type: 'error', message: 'Speech recognition error' }));
        },
        onClose: () => {
          console.log(`STT closed for interview ${interviewId}`);
        },
      });

      // Create session
      const session: VoiceSession = {
        interviewId,
        stt,
        tts,
        context,
        conversationHistory: [],
        isProcessing: false,
        pendingTranscript: '',
      };

      activeSessions.set(interviewId, session);

      // Update interview status if pending
      if (interview.status === 'PENDING') {
        await db.interview.update({
          where: { id: interviewId },
          data: {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          },
        });

        emitTo.user(interview.recruiterId, 'interview:status', {
          interviewId,
          status: 'IN_PROGRESS',
        });
      }

      // Connect to STT
      try {
        await stt.connect();
      } catch (error) {
        console.error('Failed to connect STT:', error);
        ws.close(4002, 'Speech recognition unavailable');
        return;
      }

      // Send ready message
      ws.send(JSON.stringify({ type: 'ready', interviewId }));

      // Generate and send opening message
      try {
        const opening = await generateOpening(context);
        session.conversationHistory.push({ role: 'assistant', content: opening });

        // Save to database
        await db.interviewMessage.create({
          data: {
            interviewId,
            role: 'assistant',
            content: opening,
          },
        });

        // Send text for display
        ws.send(JSON.stringify({ type: 'response', text: opening }));

        // Synthesize and send audio
        await synthesizeAndSend(session, opening, ws);
      } catch (error) {
        console.error('Failed to generate opening:', error);
      }
    },

    onMessage: async (evt: { data: WSMessageReceive }, ws: WSContext) => {
      const session = activeSessions.get(interviewId);
      if (!session) return;

      // Handle incoming audio data
      if (evt.data instanceof ArrayBuffer || evt.data instanceof Blob) {
        const audioData = evt.data instanceof Blob
          ? Buffer.from(await evt.data.arrayBuffer())
          : Buffer.from(evt.data);

        // Forward to STT
        session.stt.sendAudio(audioData);
      }

      // Handle control messages
      if (typeof evt.data === 'string') {
        try {
          const message = JSON.parse(evt.data);

          switch (message.type) {
            case 'end':
              await endInterview(interviewId, ws);
              break;

            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              break;

            case 'finish_speaking':
              // User finished speaking, process any pending transcript
              if (session.pendingTranscript.trim()) {
                await processUserInput(session, session.pendingTranscript, ws);
                session.pendingTranscript = '';
              }
              break;

            default:
              console.log(`Unknown message type: ${message.type}`);
          }
        } catch {
          // Not JSON, ignore
        }
      }
    },

    onClose: async () => {
      console.log(`Voice session closed for interview: ${interviewId}`);
      await cleanupSession(interviewId);
    },

    onError: (evt: Event) => {
      console.error(`Voice session error for interview: ${interviewId}`, evt);
    },
  };
}

/**
 * Handle transcript events from STT
 */
async function handleTranscript(
  interviewId: string,
  event: TranscriptEvent,
  ws: WSContext
) {
  const session = activeSessions.get(interviewId);
  if (!session) return;

  // Send interim transcripts to client for display
  ws.send(JSON.stringify({
    type: 'transcript',
    text: event.transcript,
    isFinal: event.isFinal,
    confidence: event.confidence,
  }));

  if (event.isFinal && event.transcript.trim()) {
    // Accumulate final transcripts
    session.pendingTranscript += ' ' + event.transcript;

    // Process after a short pause (debounce)
    // In production, you might use VAD events or explicit signals
    if (!session.isProcessing) {
      setTimeout(async () => {
        if (session.pendingTranscript.trim() && !session.isProcessing) {
          const transcript = session.pendingTranscript.trim();
          session.pendingTranscript = '';
          await processUserInput(session, transcript, ws);
        }
      }, 1000); // 1 second debounce
    }
  }
}

/**
 * Process user input and generate AI response
 */
async function processUserInput(
  session: VoiceSession,
  userText: string,
  ws: WSContext
) {
  if (session.isProcessing) return;
  session.isProcessing = true;

  try {
    // Add user message to history
    session.conversationHistory.push({ role: 'user', content: userText });

    // Save user message to database
    await db.interviewMessage.create({
      data: {
        interviewId: session.interviewId,
        role: 'user',
        content: userText,
      },
    });

    // Notify client we're processing
    ws.send(JSON.stringify({ type: 'processing' }));

    // Generate AI response
    const aiResponse = await generateResponse(session.context, session.conversationHistory);

    // Add to history
    session.conversationHistory.push({ role: 'assistant', content: aiResponse });

    // Save AI message to database
    await db.interviewMessage.create({
      data: {
        interviewId: session.interviewId,
        role: 'assistant',
        content: aiResponse,
      },
    });

    // Send text response
    ws.send(JSON.stringify({ type: 'response', text: aiResponse }));

    // Emit to recruiter dashboard
    emitTo.interview(session.interviewId, 'interview:message', {
      interviewId: session.interviewId,
      message: { role: 'user', content: userText },
    });
    emitTo.interview(session.interviewId, 'interview:message', {
      interviewId: session.interviewId,
      message: { role: 'assistant', content: aiResponse },
    });

    // Synthesize and send audio
    await synthesizeAndSend(session, aiResponse, ws);
  } catch (error) {
    console.error('Error processing user input:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to process response' }));
  } finally {
    session.isProcessing = false;
  }
}

/**
 * Synthesize speech and send audio to client
 */
async function synthesizeAndSend(
  session: VoiceSession,
  text: string,
  ws: WSContext
) {
  return new Promise<void>((resolve, reject) => {
    session.tts.synthesize(
      text,
      {
        onAudio: (audioData) => {
          // Send audio chunk as Uint8Array
          ws.send(new Uint8Array(audioData));
        },
        onError: (error) => {
          console.error('TTS error:', error);
          reject(error);
        },
        onComplete: () => {
          ws.send(JSON.stringify({ type: 'audio_complete' }));
          resolve();
        },
      }
    );
  });
}

/**
 * End the interview and generate summary
 */
async function endInterview(interviewId: string, ws: WSContext) {
  const session = activeSessions.get(interviewId);

  const interview = await db.interview.update({
    where: { id: interviewId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  // TODO: Generate score and summary using LLM

  emitTo.user(interview.recruiterId, 'interview:status', {
    interviewId,
    status: 'COMPLETED',
  });

  ws.send(JSON.stringify({ type: 'ended', interviewId }));

  // Cleanup
  await cleanupSession(interviewId);

  ws.close(1000, 'Interview completed');
}

/**
 * Clean up session resources
 */
async function cleanupSession(interviewId: string) {
  const session = activeSessions.get(interviewId);
  if (session) {
    session.stt.close();
    session.tts.close();
    activeSessions.delete(interviewId);
  }
}
