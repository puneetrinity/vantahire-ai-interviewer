/**
 * Deepgram Speech-to-Text (STT) Service
 * Uses Nova-2 model for real-time streaming transcription
 */

import WebSocket from 'ws';
import { config } from '../../lib/config.js';

export interface TranscriptEvent {
  transcript: string;
  isFinal: boolean;
  confidence: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export interface STTCallbacks {
  onTranscript: (event: TranscriptEvent) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export class DeepgramSTT {
  private ws: WebSocket | null = null;
  private callbacks: STTCallbacks;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor(callbacks: STTCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to Deepgram streaming API
   */
  async connect(): Promise<void> {
    const params = new URLSearchParams({
      model: 'nova-2', // Nova-3 when available, Nova-2 is current best
      language: 'en-US',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300', // ms of silence to end utterance
      vad_events: 'true',
      smart_format: 'true',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${config.DEEPGRAM_API_KEY}`,
        },
      });

      this.ws.on('open', () => {
        console.log('Deepgram STT connected');
        this.startKeepAlive();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const response = JSON.parse(data.toString());

          if (response.type === 'Results') {
            const alternative = response.channel?.alternatives?.[0];
            if (alternative) {
              this.callbacks.onTranscript({
                transcript: alternative.transcript || '',
                isFinal: response.is_final === true,
                confidence: alternative.confidence || 0,
                words: alternative.words,
              });
            }
          } else if (response.type === 'SpeechStarted') {
            // Voice activity detected
          } else if (response.type === 'UtteranceEnd') {
            // End of utterance detected
          }
        } catch (err) {
          console.error('Failed to parse Deepgram response:', err);
        }
      });

      this.ws.on('error', (error) => {
        console.error('Deepgram STT error:', error);
        this.callbacks.onError(error);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Deepgram STT closed: ${code} ${reason}`);
        this.stopKeepAlive();
        this.callbacks.onClose();
      });
    });
  }

  /**
   * Send audio data to Deepgram
   * @param audioData - Raw PCM audio (16-bit, 16kHz, mono)
   */
  sendAudio(audioData: ArrayBuffer | Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  /**
   * Signal end of audio stream
   */
  finishStream(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send empty buffer to signal end
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Keep connection alive with periodic pings
   */
  private startKeepAlive(): void {
    this.keepAliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 10000); // Every 10 seconds
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
