import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { interviewId, recordingPath } = await req.json();

    if (!interviewId || !recordingPath) {
      throw new Error('Interview ID and recording path are required');
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching video from storage:', recordingPath);

    // Get signed URL for the video
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('interview-documents')
      .createSignedUrl(recordingPath, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error('Failed to get video URL: ' + (signedUrlError?.message || 'Unknown error'));
    }

    console.log('Downloading video for transcription...');

    // Download the video file
    const videoResponse = await fetch(signedUrlData.signedUrl);
    if (!videoResponse.ok) {
      throw new Error('Failed to download video: ' + videoResponse.statusText);
    }

    const videoBlob = await videoResponse.blob();
    console.log('Video downloaded, size:', videoBlob.size, 'bytes');

    // Create form data for ElevenLabs
    const formData = new FormData();
    formData.append('file', videoBlob, 'video.webm');
    formData.append('model_id', 'scribe_v1');
    formData.append('tag_audio_events', 'false');
    formData.append('diarize', 'true'); // Enable speaker diarization

    console.log('Sending to ElevenLabs for transcription...');

    // Call ElevenLabs Speech-to-Text API
    const transcribeResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('ElevenLabs error:', errorText);
      throw new Error('Transcription failed: ' + errorText);
    }

    const transcription = await transcribeResponse.json();
    console.log('Transcription complete. Text length:', transcription.text?.length || 0);

    // Format the transcription with speaker labels and timestamps
    const formattedTranscript = formatTranscription(transcription);

    // Store the video transcription in the database
    const { error: updateError } = await supabase
      .from('interviews')
      .update({ 
        candidate_notes: JSON.stringify({
          video_transcription: transcription.text,
          video_transcription_detailed: formattedTranscript,
          transcribed_at: new Date().toISOString()
        })
      })
      .eq('id', interviewId);

    if (updateError) {
      console.error('Error updating interview:', updateError);
      // Don't throw, still return the transcription
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcription: transcription.text,
        detailed: formattedTranscript,
        words: transcription.words || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

interface Word {
  text: string;
  start: number;
  end: number;
  speaker?: string;
}

interface TranscriptionSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

function formatTranscription(transcription: { text: string; words?: Word[] }): TranscriptionSegment[] {
  if (!transcription.words || transcription.words.length === 0) {
    return [{
      speaker: 'Speaker',
      text: transcription.text,
      startTime: 0,
      endTime: 0
    }];
  }

  const segments: TranscriptionSegment[] = [];
  let currentSegment: TranscriptionSegment | null = null;

  for (const word of transcription.words) {
    const speaker = word.speaker || 'Speaker 1';

    if (!currentSegment || currentSegment.speaker !== speaker) {
      // Save current segment
      if (currentSegment) {
        segments.push(currentSegment);
      }
      // Start new segment
      currentSegment = {
        speaker,
        text: word.text,
        startTime: word.start,
        endTime: word.end
      };
    } else {
      // Append to current segment
      currentSegment.text += ' ' + word.text;
      currentSegment.endTime = word.end;
    }
  }

  // Push the last segment
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}
