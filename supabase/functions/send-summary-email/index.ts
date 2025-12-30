import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendSummaryEmailRequest {
  recipientEmail: string;
  candidateName: string;
  jobRole: string;
  overallScore: number | null;
  summary: string;
  recommendation: string;
  communicationScore: number;
  technicalScore: number;
  cultureFitScore: number;
  strengths: string[];
  areasForImprovement: string[];
  keyTakeaways: string[];
  senderName: string;
  companyName: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-summary-email function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Extract the token from the Authorization header
    const token = authHeader.replace("Bearer ", "");
    
    // Create a client with the user's token to verify authentication
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { 
        global: { 
          headers: { Authorization: `Bearer ${token}` } 
        } 
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      console.error("Auth error:", userError?.message || "No user found");
      return new Response(JSON.stringify({ code: 401, message: "Invalid JWT" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    console.log("Authenticated user:", user.email);

    const requestData: SendSummaryEmailRequest = await req.json();
    console.log("Sending summary email to:", requestData.recipientEmail);

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      console.error("BREVO_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const strengthsList = requestData.strengths.map(s => `<li style="margin-bottom: 8px; color: #10b981;">✓ ${s}</li>`).join('');
    const improvementsList = requestData.areasForImprovement.map(a => `<li style="margin-bottom: 8px; color: #f59e0b;">• ${a}</li>`).join('');
    const takeawaysList = requestData.keyTakeaways.map(t => `<li style="margin-bottom: 8px;">• ${t}</li>`).join('');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%); border-radius: 12px 12px 0 0; padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Interview Summary</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${requestData.companyName || 'VantaHire'}</p>
    </div>
    
    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Candidate Info -->
      <div style="display: flex; align-items: center; margin-bottom: 25px; padding: 20px; background: #f8f8fc; border-radius: 10px;">
        <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #a855f7); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; margin-right: 15px;">
          ${(requestData.candidateName || 'C').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div style="flex: 1;">
          <h2 style="margin: 0; color: #1f2937; font-size: 18px;">${requestData.candidateName}</h2>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">${requestData.jobRole}</p>
        </div>
        ${requestData.overallScore ? `
        <div style="text-align: right;">
          <div style="font-size: 28px; font-weight: bold; color: #8b5cf6;">${requestData.overallScore}/10</div>
          <div style="font-size: 12px; color: #6b7280;">Overall Score</div>
        </div>
        ` : ''}
      </div>

      <!-- AI Summary -->
      <div style="margin-bottom: 25px; padding: 20px; background: #faf5ff; border-left: 4px solid #8b5cf6; border-radius: 0 10px 10px 0;">
        <h3 style="margin: 0 0 10px 0; color: #1f2937; font-size: 16px;">AI Summary</h3>
        <p style="margin: 0; color: #4b5563; line-height: 1.6;">${requestData.summary}</p>
      </div>

      <!-- Recommendation -->
      <div style="margin-bottom: 25px; padding: 20px; background: #f8f8fc; border-radius: 10px;">
        <h3 style="margin: 0 0 10px 0; color: #1f2937; font-size: 16px;">Recommendation</h3>
        <p style="margin: 0; color: #4b5563; line-height: 1.6;">${requestData.recommendation}</p>
      </div>

      <!-- Scores -->
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">Detailed Scores</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 15px; text-align: center; background: #f8f8fc; border-radius: 10px 0 0 10px;">
              <div style="font-size: 24px; font-weight: bold; color: #1f2937;">${requestData.communicationScore}/10</div>
              <div style="font-size: 12px; color: #6b7280;">Communication</div>
            </td>
            <td style="padding: 15px; text-align: center; background: #f8f8fc;">
              <div style="font-size: 24px; font-weight: bold; color: #1f2937;">${requestData.technicalScore}/10</div>
              <div style="font-size: 12px; color: #6b7280;">Technical</div>
            </td>
            <td style="padding: 15px; text-align: center; background: #f8f8fc; border-radius: 0 10px 10px 0;">
              <div style="font-size: 24px; font-weight: bold; color: #1f2937;">${requestData.cultureFitScore}/10</div>
              <div style="font-size: 12px; color: #6b7280;">Culture Fit</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Strengths -->
      <div style="margin-bottom: 25px; padding: 20px; background: #f0fdf4; border-radius: 10px;">
        <h3 style="margin: 0 0 15px 0; color: #166534; font-size: 16px;">⭐ Strengths</h3>
        <ul style="margin: 0; padding-left: 0; list-style: none;">${strengthsList}</ul>
      </div>

      <!-- Areas for Improvement -->
      <div style="margin-bottom: 25px; padding: 20px; background: #fffbeb; border-radius: 10px;">
        <h3 style="margin: 0 0 15px 0; color: #92400e; font-size: 16px;">📈 Areas for Improvement</h3>
        <ul style="margin: 0; padding-left: 0; list-style: none;">${improvementsList}</ul>
      </div>

      <!-- Key Takeaways -->
      <div style="margin-bottom: 25px; padding: 20px; background: #f8f8fc; border-radius: 10px;">
        <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">Key Takeaways</h3>
        <ul style="margin: 0; padding-left: 0; list-style: none; color: #4b5563;">${takeawaysList}</ul>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          Shared by ${requestData.senderName} via VantaHire
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: requestData.companyName || "VantaHire", email: "noreply@vantahire.com" },
        to: [{ email: requestData.recipientEmail }],
        subject: `Interview Summary: ${requestData.candidateName} - ${requestData.jobRole}`,
        htmlContent: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Brevo API error:", errorText);
      throw new Error(`Failed to send email: ${errorText}`);
    }

    const result = await emailResponse.json();
    console.log("Email sent successfully:", result);

    return new Response(JSON.stringify({ success: true, messageId: result.messageId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending summary email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
