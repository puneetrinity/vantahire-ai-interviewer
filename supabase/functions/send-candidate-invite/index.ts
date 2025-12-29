import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteEmailRequest {
  candidateEmail: string;
  candidateName: string | null;
  jobRole: string;
  interviewId: string;
  interviewUrl: string;
  recruiterId?: string;
}

interface RecruiterBranding {
  company_name: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_intro: string | null;
  email_tips: string | null;
  email_cta_text: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidateEmail, candidateName, jobRole, interviewId, interviewUrl, recruiterId }: InviteEmailRequest = await req.json();

    console.log(`Sending interview invite to ${candidateEmail} for ${jobRole} position`);

    // Fetch recruiter branding if recruiterId is provided
    let branding: RecruiterBranding = {
      company_name: null,
      brand_color: '#6366f1',
      logo_url: null,
      email_intro: null,
      email_tips: null,
      email_cta_text: null
    };

    if (recruiterId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name, brand_color, logo_url, email_intro, email_tips, email_cta_text')
        .eq('id', recruiterId)
        .single();

      if (profile) {
        branding = {
          company_name: profile.company_name,
          brand_color: profile.brand_color || '#6366f1',
          logo_url: profile.logo_url,
          email_intro: profile.email_intro,
          email_tips: profile.email_tips,
          email_cta_text: profile.email_cta_text
        };
      }
    }

    const displayName = candidateName || "Candidate";
    const companyName = branding.company_name || "InterviewAI";
    const brandColor = branding.brand_color || '#6366f1';
    const brandColorLight = brandColor + '33'; // Add transparency for light version
    
    // Custom email copy with fallbacks
    const introText = branding.email_intro || `You've been invited to complete an AI-powered interview for the <strong style="color: #18181b;">${jobRole}</strong> position${branding.company_name ? ` at <strong style="color: #18181b;">${branding.company_name}</strong>` : ''}.`;
    const tipsText = branding.email_tips || "Find a quiet place with a stable internet connection. Speak clearly and take your time with each response.";
    const ctaText = branding.email_cta_text || "Start Your Interview";
    
    // Generate gradient colors based on brand color
    const gradientEnd = adjustColor(brandColor, 20);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${companyName} <onboarding@resend.dev>`,
        to: [candidateEmail],
        subject: `You're Invited: AI Interview for ${jobRole} Position${branding.company_name ? ` at ${branding.company_name}` : ''}`,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, ${brandColor} 0%, ${gradientEnd} 100%); padding: 40px 40px; text-align: center;">
                      ${branding.logo_url ? `<img src="${branding.logo_url}" alt="${companyName}" style="max-height: 50px; max-width: 200px; margin-bottom: 16px;">` : ''}
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">${companyName}</h1>
                      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">AI-Powered Interview Platform</p>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px;">
                      <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 24px;">Hello ${displayName}!</h2>
                      
                      <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                        ${introText}
                      </p>
                      
                      <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin: 0 0 24px 0;">
                        <h3 style="color: #18181b; margin: 0 0 12px 0; font-size: 16px;">What to expect:</h3>
                        <ul style="color: #52525b; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                          <li>A conversational AI interview experience</li>
                          <li>Approximately 15-30 minutes to complete</li>
                          <li>Questions tailored to the ${jobRole} role</li>
                          <li>Complete at your own pace and convenience</li>
                        </ul>
                      </div>
                      
                      <p style="color: #52525b; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                        <strong>Tips for success:</strong> ${tipsText}
                      </p>
                      
                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 8px 0 24px 0;">
                            <a href="${interviewUrl}" style="display: inline-block; background: linear-gradient(135deg, ${brandColor} 0%, ${gradientEnd} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px ${brandColor}66;">
                              ${ctaText}
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="color: #a1a1aa; font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
                        If the button doesn't work, copy and paste this link into your browser:<br>
                        <a href="${interviewUrl}" style="color: ${brandColor}; word-break: break-all;">${interviewUrl}</a>
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center;">
                      <p style="color: #71717a; font-size: 12px; margin: 0;">
                        This interview invitation was sent by ${companyName}.<br>
                        If you didn't expect this email, you can safely ignore it.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error("Resend API error:", errorData);
      throw new Error(errorData.message || "Failed to send email");
    }

    const responseData = await emailResponse.json();
    console.log("Email sent successfully:", responseData);

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-candidate-invite function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

serve(handler);
