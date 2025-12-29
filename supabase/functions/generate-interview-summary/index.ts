import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Send notification email to recruiter
async function sendRecruiterNotification(
  recruiterEmail: string,
  candidateName: string,
  jobRole: string,
  score: number,
  summary: any,
  interviewId: string
) {
  const dashboardUrl = Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '') || '';
  
  const strengthsList = summary.strengths?.map((s: string) => `<li>${s}</li>`).join('') || '';
  const improvementsList = summary.areasForImprovement?.map((s: string) => `<li>${s}</li>`).join('') || '';
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
        .score-badge { display: inline-block; background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-size: 18px; font-weight: bold; }
        .score-low { background: #ef4444; }
        .score-medium { background: #f59e0b; }
        .section { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .section h3 { margin-top: 0; color: #6366f1; }
        .strengths li { color: #10b981; }
        .improvements li { color: #f59e0b; }
        .recommendation { background: #eef2ff; padding: 15px; border-radius: 8px; border-left: 4px solid #6366f1; }
        .scores-grid { display: flex; gap: 10px; flex-wrap: wrap; }
        .score-item { flex: 1; min-width: 80px; text-align: center; padding: 10px; background: #f3f4f6; border-radius: 8px; }
        .score-item .value { font-size: 24px; font-weight: bold; color: #6366f1; }
        .score-item .label { font-size: 12px; color: #6b7280; }
        .cta-button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Interview Completed</h1>
          <p style="margin: 0; opacity: 0.9;">AI Interview Summary Ready</p>
        </div>
        <div class="content">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="margin: 0;">${candidateName || 'Candidate'}</h2>
            <p style="color: #6b7280; margin: 5px 0;">${jobRole}</p>
            <span class="score-badge ${score < 5 ? 'score-low' : score < 7 ? 'score-medium' : ''}">${score}/10 Overall Score</span>
          </div>

          <div class="section">
            <h3>📊 Score Breakdown</h3>
            <div class="scores-grid">
              <div class="score-item">
                <div class="value">${summary.communicationScore || '-'}</div>
                <div class="label">Communication</div>
              </div>
              <div class="score-item">
                <div class="value">${summary.technicalScore || '-'}</div>
                <div class="label">Technical</div>
              </div>
              <div class="score-item">
                <div class="value">${summary.cultureFitScore || '-'}</div>
                <div class="label">Culture Fit</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h3>📝 Summary</h3>
            <p>${summary.summary || 'No summary available.'}</p>
          </div>

          <div class="recommendation">
            <strong>💡 Recommendation:</strong> ${summary.recommendation || 'No recommendation available.'}
          </div>

          ${strengthsList ? `
          <div class="section">
            <h3>✅ Strengths</h3>
            <ul class="strengths">${strengthsList}</ul>
          </div>
          ` : ''}

          ${improvementsList ? `
          <div class="section">
            <h3>⚠️ Areas for Improvement</h3>
            <ul class="improvements">${improvementsList}</ul>
          </div>
          ` : ''}

          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #6b7280;">View the full interview details, transcript, and recording in your dashboard.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { error } = await resend.emails.send({
      from: "InterviewAI <onboarding@resend.dev>",
      to: [recruiterEmail],
      subject: `✅ Interview Complete: ${candidateName || 'Candidate'} - ${jobRole} (Score: ${score}/10)`,
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send recruiter notification:", error);
      return false;
    }

    console.log("Recruiter notification sent to:", recruiterEmail);
    return true;
  } catch (error) {
    console.error("Error sending recruiter notification:", error);
    return false;
  }
}

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

    // Fetch interview details including recruiter_id
    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', interviewId)
      .single();

    if (interviewError || !interview) {
      throw new Error('Interview not found');
    }

    // Fetch recruiter's email from profiles
    const { data: recruiterProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', interview.recruiter_id)
      .single();

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
    let summaryText = aiResult.choices[0].message.content;
    
    console.log('AI Summary generated:', summaryText);

    // Strip markdown code blocks if present
    summaryText = summaryText.trim();
    if (summaryText.startsWith('```json')) {
      summaryText = summaryText.slice(7);
    } else if (summaryText.startsWith('```')) {
      summaryText = summaryText.slice(3);
    }
    if (summaryText.endsWith('```')) {
      summaryText = summaryText.slice(0, -3);
    }
    summaryText = summaryText.trim();

    // Parse the JSON response
    let summary;
    try {
      summary = JSON.parse(summaryText);
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      // Return error instead of fake scores
      throw new Error('Failed to parse AI response - invalid JSON');
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

    // Send email notification to recruiter
    if (recruiterProfile?.email) {
      await sendRecruiterNotification(
        recruiterProfile.email,
        interview.candidate_name,
        interview.job_role,
        summary.overallScore,
        summary,
        interviewId
      );
    } else {
      console.log('No recruiter email found, skipping notification');
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
