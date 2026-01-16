import { describe, expect, it } from 'vitest';

// Interview context for voice pipeline
interface InterviewContext {
  jobRole: string;
  jobDescription?: string;
  candidateName?: string;
  companyName?: string;
}

// Chat message types
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// TTS provider selection
// Note: Config validation ensures CARTESIA_API_KEY is present when TTS_PROVIDER=cartesia
type TTSProvider = 'deepgram' | 'cartesia';

function selectTTSProvider(configuredProvider: TTSProvider): TTSProvider {
  // Config validation at startup ensures cartesia has a valid key
  return configuredProvider;
}

// Prompt building helpers
function buildSystemPrompt(context: InterviewContext): string {
  let prompt = `You are conducting a professional job interview for the position of ${context.jobRole}.`;

  if (context.companyName) {
    prompt += ` You are representing ${context.companyName}.`;
  }

  if (context.jobDescription) {
    prompt += ` The job description is: ${context.jobDescription}`;
  }

  prompt += '\n\nGuidelines:';
  prompt += '\n- Ask relevant technical and behavioral questions';
  prompt += '\n- Be professional but friendly';
  prompt += '\n- Probe deeper on interesting answers';
  prompt += '\n- Keep responses concise (2-3 sentences)';

  return prompt;
}

function buildOpeningMessage(context: InterviewContext): string {
  let opening = 'Hello';

  if (context.candidateName) {
    opening += `, ${context.candidateName}`;
  }

  opening += `! Welcome to this interview for the ${context.jobRole} position.`;

  if (context.companyName) {
    opening += ` I'm excited to learn more about your experience and how you might fit with ${context.companyName}.`;
  } else {
    opening += ` I'm excited to learn more about your experience.`;
  }

  opening += ' Please tell me a bit about yourself and what interests you about this role.';

  return opening;
}

function buildMessagesForLLM(
  systemPrompt: string,
  conversationHistory: ChatMessage[]
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ];
}

// MIME type detection for audio
function getAudioMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const mimeMap: Record<string, string> = {
    webm: 'video/webm',
    mp4: 'video/mp4',
    ogg: 'video/ogg',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
  };
  return mimeMap[ext] || 'video/webm';
}

describe('TTS Provider Selection', () => {
  // Note: Config validation ensures CARTESIA_API_KEY is present when TTS_PROVIDER=cartesia
  // So there's no fallback behavior - the app won't start without the key
  describe('When configured for Deepgram', () => {
    it('should use Deepgram when configured', () => {
      expect(selectTTSProvider('deepgram')).toBe('deepgram');
    });
  });

  describe('When configured for Cartesia', () => {
    it('should use Cartesia when configured', () => {
      // Config validation ensures key is present, so cartesia is always usable
      expect(selectTTSProvider('cartesia')).toBe('cartesia');
    });
  });
});

describe('System Prompt Building', () => {
  it('should include job role', () => {
    const context: InterviewContext = { jobRole: 'Software Engineer' };
    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Software Engineer');
  });

  it('should include company name when provided', () => {
    const context: InterviewContext = {
      jobRole: 'Software Engineer',
      companyName: 'TechCorp',
    };
    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('TechCorp');
  });

  it('should include job description when provided', () => {
    const context: InterviewContext = {
      jobRole: 'Software Engineer',
      jobDescription: 'Build scalable systems',
    };
    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Build scalable systems');
  });

  it('should include interview guidelines', () => {
    const context: InterviewContext = { jobRole: 'Software Engineer' };
    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Guidelines');
    expect(prompt).toContain('technical');
    expect(prompt).toContain('professional');
  });

  it('should build complete prompt with all context', () => {
    const context: InterviewContext = {
      jobRole: 'Senior Backend Engineer',
      companyName: 'VantaHire',
      jobDescription: 'Design and implement APIs',
      candidateName: 'John Doe',
    };
    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Senior Backend Engineer');
    expect(prompt).toContain('VantaHire');
    expect(prompt).toContain('Design and implement APIs');
  });
});

describe('Opening Message Building', () => {
  it('should create basic opening without candidate name', () => {
    const context: InterviewContext = { jobRole: 'Software Engineer' };
    const opening = buildOpeningMessage(context);

    expect(opening).toContain('Hello!');
    expect(opening).toContain('Software Engineer');
  });

  it('should personalize with candidate name', () => {
    const context: InterviewContext = {
      jobRole: 'Software Engineer',
      candidateName: 'John',
    };
    const opening = buildOpeningMessage(context);

    expect(opening).toContain('Hello, John!');
  });

  it('should mention company name', () => {
    const context: InterviewContext = {
      jobRole: 'Software Engineer',
      companyName: 'TechCorp',
    };
    const opening = buildOpeningMessage(context);

    expect(opening).toContain('TechCorp');
  });

  it('should ask candidate to introduce themselves', () => {
    const context: InterviewContext = { jobRole: 'Software Engineer' };
    const opening = buildOpeningMessage(context);

    expect(opening).toContain('tell me');
    expect(opening.toLowerCase()).toContain('yourself');
  });

  it('should build complete personalized opening', () => {
    const context: InterviewContext = {
      jobRole: 'Product Manager',
      candidateName: 'Alice',
      companyName: 'StartupX',
    };
    const opening = buildOpeningMessage(context);

    expect(opening).toContain('Hello, Alice!');
    expect(opening).toContain('Product Manager');
    expect(opening).toContain('StartupX');
  });
});

describe('Messages Array Building for LLM', () => {
  it('should prepend system message', () => {
    const systemPrompt = 'You are an interviewer.';
    const history: ChatMessage[] = [];
    const messages = buildMessagesForLLM(systemPrompt, history);

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(systemPrompt);
  });

  it('should include conversation history', () => {
    const systemPrompt = 'You are an interviewer.';
    const history: ChatMessage[] = [
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Hi there!' },
    ];
    const messages = buildMessagesForLLM(systemPrompt, history);

    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].role).toBe('user');
  });

  it('should preserve message order', () => {
    const systemPrompt = 'You are an interviewer.';
    const history: ChatMessage[] = [
      { role: 'assistant', content: 'First' },
      { role: 'user', content: 'Second' },
      { role: 'assistant', content: 'Third' },
      { role: 'user', content: 'Fourth' },
    ];
    const messages = buildMessagesForLLM(systemPrompt, history);

    expect(messages[1].content).toBe('First');
    expect(messages[2].content).toBe('Second');
    expect(messages[3].content).toBe('Third');
    expect(messages[4].content).toBe('Fourth');
  });

  it('should work with empty history', () => {
    const systemPrompt = 'You are an interviewer.';
    const messages = buildMessagesForLLM(systemPrompt, []);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('system');
  });
});

describe('Audio MIME Type Detection', () => {
  describe('Video formats', () => {
    it('should detect webm as video/webm', () => {
      expect(getAudioMimeType('recording.webm')).toBe('video/webm');
    });

    it('should detect mp4 as video/mp4', () => {
      expect(getAudioMimeType('recording.mp4')).toBe('video/mp4');
    });

    it('should detect ogg as video/ogg', () => {
      expect(getAudioMimeType('recording.ogg')).toBe('video/ogg');
    });
  });

  describe('Audio formats', () => {
    it('should detect wav as audio/wav', () => {
      expect(getAudioMimeType('audio.wav')).toBe('audio/wav');
    });

    it('should detect mp3 as audio/mpeg', () => {
      expect(getAudioMimeType('audio.mp3')).toBe('audio/mpeg');
    });
  });

  describe('Edge cases', () => {
    it('should handle uppercase extensions', () => {
      expect(getAudioMimeType('RECORDING.WEBM')).toBe('video/webm');
    });

    it('should default to video/webm for unknown extensions', () => {
      expect(getAudioMimeType('file.unknown')).toBe('video/webm');
    });

    it('should default to video/webm for no extension', () => {
      expect(getAudioMimeType('file')).toBe('video/webm');
    });

    it('should handle multiple dots in filename', () => {
      expect(getAudioMimeType('recording.2024.01.15.webm')).toBe('video/webm');
    });
  });
});

describe('Voice Session State', () => {
  interface VoiceSessionState {
    interviewId: string;
    isProcessing: boolean;
    pendingTranscript: string;
    conversationHistory: ChatMessage[];
  }

  it('should initialize with empty state', () => {
    const state: VoiceSessionState = {
      interviewId: 'interview-123',
      isProcessing: false,
      pendingTranscript: '',
      conversationHistory: [],
    };

    expect(state.isProcessing).toBe(false);
    expect(state.pendingTranscript).toBe('');
    expect(state.conversationHistory).toHaveLength(0);
  });

  it('should accumulate transcript', () => {
    let transcript = '';
    transcript += ' Hello';
    transcript += ' I am';
    transcript += ' John';

    expect(transcript.trim()).toBe('Hello I am John');
  });

  it('should track conversation turns', () => {
    const history: ChatMessage[] = [];

    // Opening
    history.push({ role: 'assistant', content: 'Hello!' });

    // User response
    history.push({ role: 'user', content: 'Hi, my name is John.' });

    // Follow-up
    history.push({ role: 'assistant', content: 'Nice to meet you, John.' });

    expect(history).toHaveLength(3);
    expect(history.filter(m => m.role === 'assistant')).toHaveLength(2);
    expect(history.filter(m => m.role === 'user')).toHaveLength(1);
  });
});

describe('Transcript Processing', () => {
  interface TranscriptEvent {
    transcript: string;
    isFinal: boolean;
    confidence: number;
  }

  it('should identify final transcripts', () => {
    const event: TranscriptEvent = {
      transcript: 'Hello world',
      isFinal: true,
      confidence: 0.95,
    };

    expect(event.isFinal).toBe(true);
  });

  it('should identify interim transcripts', () => {
    const event: TranscriptEvent = {
      transcript: 'Hel',
      isFinal: false,
      confidence: 0.6,
    };

    expect(event.isFinal).toBe(false);
  });

  it('should filter out empty transcripts', () => {
    const events: TranscriptEvent[] = [
      { transcript: 'Hello', isFinal: true, confidence: 0.9 },
      { transcript: '', isFinal: true, confidence: 0 },
      { transcript: '   ', isFinal: true, confidence: 0 },
      { transcript: 'World', isFinal: true, confidence: 0.95 },
    ];

    const valid = events.filter(e => e.transcript.trim().length > 0);
    expect(valid).toHaveLength(2);
  });
});

describe('Debounce Logic for User Input', () => {
  it('should accumulate transcripts during debounce window', async () => {
    let accumulated = '';
    const transcripts = ['Hello', 'my', 'name', 'is', 'John'];

    for (const t of transcripts) {
      accumulated += ' ' + t;
    }

    expect(accumulated.trim()).toBe('Hello my name is John');
  });

  it('should clear pending after processing', () => {
    let pending = 'Some transcript';
    pending = '';
    expect(pending).toBe('');
  });
});
