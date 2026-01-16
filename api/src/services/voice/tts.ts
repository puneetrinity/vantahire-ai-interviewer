/**
 * Text-to-Speech (TTS) Service
 * Supports Deepgram Aura-2 (default) and Cartesia Sonic (low-latency)
 * Provider controlled by TTS_PROVIDER env var
 */

import WebSocket from 'ws';
import { config } from '../../lib/config.js';

export interface TTSCallbacks {
  onAudio: (audioData: Buffer) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
}

// Voice IDs
const DEEPGRAM_VOICES = {
  male: 'aura-orion-en',
  female: 'aura-luna-en',
  default: 'aura-asteria-en', // Professional female voice
};

const CARTESIA_VOICES = {
  male: '95856005-0332-41b0-935f-352e296aa0df', // Professional male
  female: 'a0e99841-438c-4a64-b679-ae501e7d6091', // Professional female
  default: 'a0e99841-438c-4a64-b679-ae501e7d6091',
};

/**
 * Abstract TTS interface
 */
export interface TTSProvider {
  synthesize(text: string, callbacks: TTSCallbacks, options?: TTSOptions): Promise<void>;
  close(): void;
}

/**
 * Deepgram Aura TTS Provider
 * Uses REST API for simplicity (WebSocket available for streaming)
 */
export class DeepgramTTS implements TTSProvider {
  async synthesize(text: string, callbacks: TTSCallbacks, options?: TTSOptions): Promise<void> {
    const voice = options?.voice || DEEPGRAM_VOICES.default;

    try {
      const response = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${config.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Deepgram TTS error: ${response.status} ${response.statusText}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      callbacks.onAudio(audioBuffer);
      callbacks.onComplete();
    } catch (error) {
      callbacks.onError(error as Error);
    }
  }

  close(): void {
    // No persistent connection to close for REST API
  }
}

/**
 * Cartesia Sonic TTS Provider
 * Uses WebSocket for streaming low-latency synthesis
 */
export class CartesiaTTS implements TTSProvider {
  private ws: WebSocket | null = null;

  async synthesize(text: string, callbacks: TTSCallbacks, options?: TTSOptions): Promise<void> {
    if (!config.CARTESIA_API_KEY) {
      throw new Error('CARTESIA_API_KEY not configured');
    }

    const voice = options?.voice || CARTESIA_VOICES.default;

    return new Promise((resolve, reject) => {
      const url = 'wss://api.cartesia.ai/tts/websocket';

      this.ws = new WebSocket(url, {
        headers: {
          'X-API-Key': config.CARTESIA_API_KEY!,
          'Cartesia-Version': '2024-06-10',
        },
      });

      this.ws.on('open', () => {
        const request = {
          model_id: 'sonic-english',
          voice: {
            mode: 'id',
            id: voice,
          },
          transcript: text,
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 24000,
          },
          context_id: `ctx_${Date.now()}`,
        };

        this.ws!.send(JSON.stringify(request));
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          // Cartesia sends JSON metadata or raw audio
          if (data instanceof Buffer) {
            // Check if it's JSON or raw audio
            try {
              const json = JSON.parse(data.toString());
              if (json.type === 'done') {
                callbacks.onComplete();
                resolve();
              } else if (json.type === 'error') {
                callbacks.onError(new Error(json.message));
                reject(new Error(json.message));
              }
            } catch {
              // It's raw audio data
              callbacks.onAudio(data);
            }
          }
        } catch (err) {
          console.error('Cartesia message parse error:', err);
        }
      });

      this.ws.on('error', (error) => {
        callbacks.onError(error);
        reject(error);
      });

      this.ws.on('close', () => {
        callbacks.onComplete();
        resolve();
      });
    });
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Factory function to get the configured TTS provider
 */
export function createTTSProvider(): TTSProvider {
  if (config.TTS_PROVIDER === 'cartesia') {
    console.log('Using Cartesia Sonic TTS (low-latency mode)');
    return new CartesiaTTS();
  }

  console.log('Using Deepgram Aura TTS');
  return new DeepgramTTS();
}

/**
 * High-level function to synthesize speech
 */
export async function synthesizeSpeech(
  text: string,
  options?: TTSOptions
): Promise<Buffer> {
  const provider = createTTSProvider();
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    provider.synthesize(
      text,
      {
        onAudio: (data) => chunks.push(data),
        onError: (error) => {
          provider.close();
          reject(error);
        },
        onComplete: () => {
          provider.close();
          resolve(Buffer.concat(chunks));
        },
      },
      options
    );
  });
}

/**
 * Streaming TTS for lower latency
 * Yields audio chunks as they're generated
 */
export async function* streamSpeech(
  text: string,
  options?: TTSOptions
): AsyncGenerator<Buffer, void, unknown> {
  const provider = createTTSProvider();
  const audioQueue: Buffer[] = [];
  let isComplete = false;
  let error: Error | null = null;

  // Start synthesis in background
  provider.synthesize(
    text,
    {
      onAudio: (data) => audioQueue.push(data),
      onError: (err) => {
        error = err;
        isComplete = true;
      },
      onComplete: () => {
        isComplete = true;
      },
    },
    options
  ).catch((err) => {
    error = err;
    isComplete = true;
  });

  // Yield chunks as they arrive
  while (!isComplete || audioQueue.length > 0) {
    if (audioQueue.length > 0) {
      yield audioQueue.shift()!;
    } else if (!isComplete) {
      // Wait a bit for more data
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  provider.close();

  if (error) {
    throw error;
  }
}
