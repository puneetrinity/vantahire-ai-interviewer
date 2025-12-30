import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ApplicationNotificationRequest {
  jobId: string;
  jobTitle: string;
  recruiterId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  hasResume: boolean;
  hasCoverLetter: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BREVO_API_KEY) {
      throw new Error("Missing BREVO_API_KEY secret");
    }

    const { 
      jobId, 
      jobTitle, 
      recruiterId, 
      candidateName, 
      candidateEmail,
      candidatePhone,
      hasResume,
      hasCoverLetter
    }: ApplicationNotificationRequest = await req.json();

    console.log(`Sending application notification for job ${jobId} to recruiter ${recruiterId}`);

    // Create Supabase client to fetch recruiter email
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recruiter profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name, company_name")
      .eq("id", recruiterId)
      .single();

    if (profileError || !profile?.email) {
      console.error("Failed to fetch recruiter profile:", profileError);
      throw new Error("Could not find recruiter email");
    }

    const recruiterName = profile.full_name || "Recruiter";
    const recruiterEmail = profile.email;
    const companyName = profile.company_name || "Your Company";

    const subject = `📩 New Application for "${jobTitle}"`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
          .candidate-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .candidate-name { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 12px; }
          .detail-row { display: flex; align-items: center; margin: 8px 0; color: #4b5563; }
          .detail-icon { margin-right: 8px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; margin-right: 8px; }
          .badge-green { background: #d1fae5; color: #065f46; }
          .badge-gray { background: #f3f4f6; color: #6b7280; }
          .button { display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin-top: 20px; font-weight: 500; }
          .button:hover { background: #4f46e5; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">🎉 New Application Received!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Someone applied to your job posting</p>
          </div>
          <div class="content">
            <p>Hi ${recruiterName},</p>
            <p>Great news! A candidate has applied to your job posting <strong>"${jobTitle}"</strong> at ${companyName}.</p>
            
            <div class="candidate-card">
              <div class="candidate-name">👤 ${candidateName}</div>
              <div class="detail-row">
                <span class="detail-icon">📧</span>
                <span>${candidateEmail}</span>
              </div>
              <div class="detail-row">
                <span class="detail-icon">📱</span>
                <span>${candidatePhone}</span>
              </div>
              <div style="margin-top: 12px;">
                <span class="badge ${hasResume ? 'badge-green' : 'badge-gray'}">
                  ${hasResume ? '✓ Resume attached' : '✗ No resume'}
                </span>
                <span class="badge ${hasCoverLetter ? 'badge-green' : 'badge-gray'}">
                  ${hasCoverLetter ? '✓ Cover letter' : '✗ No cover letter'}
                </span>
              </div>
            </div>
            
            <p>Review this application and take action from your dashboard. You can view the candidate's details, download their resume, and schedule an AI interview.</p>
            
            <p style="text-align: center;">
              <a href="https://vantahire.lovable.app/dashboard" class="button">View Application</a>
            </p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The Vantahire Team</p>
            <p style="font-size: 12px; color: #9ca3af;">You received this email because a candidate applied to your job posting on Vantahire.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email using Brevo API
    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: "Vantahire",
          email: "hello@vantahire.com",
        },
        to: [
          {
            email: recruiterEmail,
            name: recruiterName,
          },
        ],
        subject,
        htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error("Brevo API error:", errorData);
      throw new Error(errorData.message || "Failed to send email via Brevo");
    }

    const responseData = await emailResponse.json();
    console.log("Application notification sent successfully via Brevo:", responseData);

    return new Response(JSON.stringify({ success: true, emailResponse: responseData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-application-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
