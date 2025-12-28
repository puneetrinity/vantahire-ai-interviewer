import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { interviewId } = await req.json();

    if (!interviewId) {
      throw new Error('Interview ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch interview details
    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', interviewId)
      .single();

    if (interviewError || !interview) {
      throw new Error('Interview not found');
    }

    // Fetch all messages for this interview
    const { data: messages, error: messagesError } = await supabase
      .from('interview_messages')
      .select('*')
      .eq('interview_id', interviewId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      throw new Error('Failed to fetch messages');
    }

    // Build transcript text
    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`)
      .join('\n\n');

    console.log('Generating summary for interview:', interviewId);
    console.log('Message count:', messages.length);

    // Generate AI summary using Lovable AI gateway
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const summaryPrompt = `You are an expert HR recruiter. Analyze the following interview transcript for the position of "${interview.job_role}".

Candidate: ${interview.candidate_name || 'Unknown'}

TRANSCRIPT:
${transcript || 'No transcript available'}

${interview.candidate_notes ? `\nCANDIDATE NOTES:\n${interview.candidate_notes}` : ''}

Provide a comprehensive interview summary in the following JSON format:
{
  "overallScore": <number 1-10>,
  "summary": "<2-3 sentence executive summary>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "areasForImprovement": ["<area 1>", "<area 2>"],
  "keyTakeaways": ["<takeaway 1>", "<takeaway 2>", "<takeaway 3>"],
  "recommendation": "<hire/maybe/pass with brief explanation>",
  "communicationScore": <number 1-10>,
  "technicalScore": <number 1-10>,
  "cultureFitScore": <number 1-10>
}

Respond ONLY with valid JSON, no additional text.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert HR recruiter providing interview analysis.' },
          { role: 'user', content: summaryPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error('Failed to generate summary');
    }

    const aiResult = await response.json();
    const summaryText = aiResult.choices[0].message.content;
    
    console.log('AI Summary generated:', summaryText);

    // Parse the JSON response
    let summary;
    try {
      summary = JSON.parse(summaryText);
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      summary = {
        overallScore: 7,
        summary: summaryText,
        strengths: [],
        areasForImprovement: [],
        keyTakeaways: [],
        recommendation: 'Review transcript manually',
        communicationScore: 7,
        technicalScore: 7,
        cultureFitScore: 7
      };
    }

    // Update interview with summary
    const { error: updateError } = await supabase
      .from('interviews')
      .update({
        transcript_summary: JSON.stringify(summary),
        score: summary.overallScore,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', interviewId);

    if (updateError) {
      console.error('Failed to update interview:', updateError);
      throw new Error('Failed to save summary');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary,
        transcript: messages
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating summary:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
