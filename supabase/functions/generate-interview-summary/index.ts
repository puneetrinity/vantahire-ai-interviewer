import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Send notification email to recruiter using Brevo
async function sendRecruiterNotification(
  recruiterEmail: string,
  candidateName: string,
  jobRole: string,
  score: number,
  summary: any,
  interviewId: string,
  branding: { company_name: string | null; brand_color: string | null; logo_url: string | null }
) {
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) {
    console.error("BREVO_API_KEY not configured");
    return false;
  }

  const companyName = branding.company_name || 'VantaHire';
  const brandColor = branding.brand_color || '#6366f1';
  
  // Generate gradient color
  const gradientEnd = adjustColor(brandColor, 30);
  
  const strengthsList = summary.strengths?.map((s: string) => `<li>${escapeHtml(s)}</li>`).join('') || '';
  const improvementsList = summary.areasForImprovement?.map((s: string) => `<li>${escapeHtml(s)}</li>`).join('') || '';
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, ${escapeHtml(brandColor)}, ${escapeHtml(gradientEnd)}); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
        .score-badge { display: inline-block; background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-size: 18px; font-weight: bold; }
        .score-low { background: #ef4444; }
        .score-medium { background: #f59e0b; }
        .section { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .section h3 { margin-top: 0; color: ${escapeHtml(brandColor)}; }
        .strengths li { color: #10b981; }
        .improvements li { color: #f59e0b; }
        .recommendation { background: ${escapeHtml(brandColor)}11; padding: 15px; border-radius: 8px; border-left: 4px solid ${escapeHtml(brandColor)}; }
        .scores-grid { display: flex; gap: 10px; flex-wrap: wrap; }
        .score-item { flex: 1; min-width: 80px; text-align: center; padding: 10px; background: #f3f4f6; border-radius: 8px; }
        .score-item .value { font-size: 24px; font-weight: bold; color: ${escapeHtml(brandColor)}; }
        .score-item .label { font-size: 12px; color: #6b7280; }
        .cta-button { display: inline-block; background: ${escapeHtml(brandColor)}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${branding.logo_url ? `<img src="${escapeHtml(branding.logo_url)}" alt="${escapeHtml(companyName)}" style="max-height: 40px; max-width: 150px; margin-bottom: 12px;">` : ''}
          <h1>🎯 Interview Completed</h1>
          <p style="margin: 0; opacity: 0.9;">${escapeHtml(companyName)} - AI Interview Summary Ready</p>
        </div>
        <div class="content">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="margin: 0;">${escapeHtml(candidateName || 'Candidate')}</h2>
            <p style="color: #6b7280; margin: 5px 0;">${escapeHtml(jobRole)}</p>
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
            <p>${escapeHtml(summary.summary || 'No summary available.')}</p>
          </div>

          <div class="recommendation">
            <strong>💡 Recommendation:</strong> ${escapeHtml(summary.recommendation || 'No recommendation available.')}
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
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { 
          name: companyName, 
          email: "noreply@vantahire.com" 
        },
        to: [{ email: recruiterEmail }],
        subject: `✅ Interview Complete: ${candidateName || 'Candidate'} - ${jobRole} (Score: ${score}/10)`,
        htmlContent: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Brevo email send error:", errorText);
      return false;
    }

    console.log("Email sent successfully to:", recruiterEmail);
    return true;
  } catch (error: any) {
    console.error("Email error:", error.message);
    return false;
  }
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { interviewId } = await req.json();

    if (!interviewId) {
      return new Response(
        JSON.stringify({ error: 'Interview ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format to prevent enumeration
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(interviewId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid interview ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // AUTHORIZATION CHECK: Verify the caller has access to this interview
    const authHeader = req.headers.get('Authorization');
    
    if (authHeader) {
      // Authenticated user - verify they have access
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await userClient.auth.getUser();
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid credentials' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Use service role to check relationships
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      // Check if user is the recruiter
      const { data: interview } = await serviceClient
        .from('interviews')
        .select('recruiter_id')
        .eq('id', interviewId)
        .maybeSingle();

      if (!interview) {
        return new Response(
          JSON.stringify({ error: 'Interview not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isRecruiter = interview.recruiter_id === user.id;

      // Check if user is the candidate
      const { data: candidateLink } = await serviceClient
        .from('candidate_interviews')
        .select('id')
        .eq('interview_id', interviewId)
        .eq('anon_user_id', user.id)
        .maybeSingle();

      if (!isRecruiter && !candidateLink) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Not authorized to access this interview' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // No auth header - reject the request
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now proceed with service role for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch interview details including recruiter_id
    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', interviewId)
      .single();

    if (interviewError || !interview) {
      return new Response(
        JSON.stringify({ error: 'Interview not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch recruiter's email and branding from profiles
    const { data: recruiterProfile } = await supabase
      .from('profiles')
      .select('email, company_name, brand_color, logo_url')
      .eq('id', interview.recruiter_id)
      .single();

    // Fetch all messages for this interview
    const { data: messages, error: messagesError } = await supabase
      .from('interview_messages')
      .select('*')
      .eq('interview_id', interviewId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch messages' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${messages?.length || 0} messages for interview ${interviewId}`);

    // Build transcript text
    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`)
      .join('\n\n');

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
      return new Response(
        JSON.stringify({ error: 'Failed to generate summary' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResult = await response.json();
    let summaryText = aiResult.choices[0].message.content;

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
      console.error('Failed to parse AI response:', summaryText);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Generated summary with score:", summary.overallScore);

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
      console.error('Failed to update interview:', updateError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to save summary' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email notification to recruiter
    if (recruiterProfile?.email) {
      const branding = {
        company_name: recruiterProfile.company_name || null,
        brand_color: recruiterProfile.brand_color || '#6366f1',
        logo_url: recruiterProfile.logo_url || null
      };
      
      const emailSent = await sendRecruiterNotification(
        recruiterProfile.email,
        interview.candidate_name,
        interview.job_role,
        summary.overallScore,
        summary,
        interviewId,
        branding
      );
      
      console.log("Email notification sent:", emailSent);
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
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
