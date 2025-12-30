import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface JobStatusEmailRequest {
  jobId: string;
  jobTitle: string;
  recruiterId: string;
  status: "approved" | "rejected";
  rejectionReason?: string;
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

    const { jobId, jobTitle, recruiterId, status, rejectionReason }: JobStatusEmailRequest = await req.json();

    console.log(`Sending job ${status} email for job ${jobId} to recruiter ${recruiterId}`);

    // Create Supabase client to fetch recruiter email
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recruiter profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", recruiterId)
      .single();

    if (profileError || !profile?.email) {
      console.error("Failed to fetch recruiter profile:", profileError);
      throw new Error("Could not find recruiter email");
    }

    const recruiterName = profile.full_name || "Recruiter";
    const recruiterEmail = profile.email;

    const isApproved = status === "approved";
    const subject = isApproved 
      ? `✅ Your job posting "${jobTitle}" has been approved!`
      : `❌ Your job posting "${jobTitle}" was not approved`;

    const htmlContent = isApproved
      ? `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
            .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🎉 Job Approved!</h1>
            </div>
            <div class="content">
              <p>Hi ${recruiterName},</p>
              <p>Great news! Your job posting <strong>"${jobTitle}"</strong> has been reviewed and approved by our admin team.</p>
              <p>Your job is now live and candidates can start applying. You can manage your job posting and track applications from your dashboard.</p>
              <p style="text-align: center;">
                <a href="https://vantahire.lovable.app/dashboard" class="button">Go to Dashboard</a>
              </p>
            </div>
            <div class="footer">
              <p>Best regards,<br>The Vantahire Team</p>
            </div>
          </div>
        </body>
        </html>
      `
      : `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
            .reason-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; }
            .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Job Not Approved</h1>
            </div>
            <div class="content">
              <p>Hi ${recruiterName},</p>
              <p>Unfortunately, your job posting <strong>"${jobTitle}"</strong> was not approved by our admin team.</p>
              ${rejectionReason ? `
              <div class="reason-box">
                <strong>Reason:</strong>
                <p style="margin: 8px 0 0 0;">${rejectionReason}</p>
              </div>
              ` : ''}
              <p>Please review the feedback and feel free to update your job posting and resubmit it for approval.</p>
              <p style="text-align: center;">
                <a href="https://vantahire.lovable.app/dashboard" class="button">Edit Job Posting</a>
              </p>
            </div>
            <div class="footer">
              <p>If you have any questions, please contact our support team.<br><br>Best regards,<br>The Vantahire Team</p>
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
    console.log("Email sent successfully via Brevo:", responseData);

    return new Response(JSON.stringify({ success: true, emailResponse: responseData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-job-status-email function:", error);
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