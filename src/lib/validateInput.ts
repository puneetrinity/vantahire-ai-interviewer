import { z } from 'zod';

// Message validation schema
export const messageSchema = z.object({
  content: z.string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message is too long (max 10000 characters)'),
  role: z.enum(['user', 'assistant', 'system']),
});

// Notes validation schema
export const notesSchema = z.string()
  .trim()
  .max(5000, 'Notes are too long (max 5000 characters)');

// Interview ID validation
export const interviewIdSchema = z.string().uuid('Invalid interview ID');

// Validate and sanitize message content
export function validateMessageContent(content: unknown): { 
  valid: boolean; 
  sanitized?: string; 
  error?: string;
} {
  if (typeof content !== 'string') {
    return { valid: false, error: 'Content must be a string' };
  }

  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > 10000) {
    return { valid: false, error: 'Message is too long (max 10000 characters)' };
  }

  return { valid: true, sanitized: trimmed };
}

// Validate notes
export function validateNotes(notes: unknown): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (typeof notes !== 'string') {
    return { valid: false, error: 'Notes must be a string' };
  }

  const trimmed = notes.trim();

  if (trimmed.length > 5000) {
    return { valid: false, error: 'Notes are too long (max 5000 characters)' };
  }

  return { valid: true, sanitized: trimmed };
}
