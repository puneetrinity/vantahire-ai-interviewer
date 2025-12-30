import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const AISENSY_API_KEY = Deno.env.get("AISENSY_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAuth = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppInviteRequest {
  candidatePhone: string;
  candidateName: string | null;
  jobRole: string;
  interviewId: string;
  interviewUrl: string;
  recruiterId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!AISENSY_API_KEY) {
      throw new Error("Missing AISENSY_API_KEY secret");
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing backend environment configuration");
    }

    // Manual auth check (function is public; we validate JWT ourselves)
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    const recruiterUser = userData?.user;
    const recruiterUserId = recruiterUser?.id;

    if (userError || !recruiterUserId) {
      console.warn("Invalid token for send-whatsapp-invite:", userError?.message);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Block anonymous candidate sessions from sending invites
    if ((recruiterUser as any)?.is_anonymous) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const {
      candidatePhone,
      candidateName,
      jobRole,
      interviewId,
      interviewUrl,
      recruiterId,
    }: WhatsAppInviteRequest = await req.json();

    // Validate phone number (basic validation)
    const cleanPhone = candidatePhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!jobRole || jobRole.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid jobRole" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!interviewId) {
      return new Response(JSON.stringify({ error: "Missing interviewId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!interviewUrl || !interviewUrl.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Invalid interviewUrl" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // If recruiterId is passed, ensure it matches the authenticated user
    if (recruiterId && recruiterId !== recruiterUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(
      `Sending WhatsApp invite recruiter=${recruiterUserId} candidate=${candidatePhone} role=${jobRole}`,
    );

    // Fetch recruiter branding for company name
    let companyName = "Vantahire AI Interviewer";
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_name")
      .eq("id", recruiterUserId)
      .maybeSingle();

    if (profile?.company_name) {
      companyName = profile.company_name;
    }

    const displayName = candidateName || "Candidate";

    // Send WhatsApp message using Aisensy API
    // Template: vantahire_interview_invitation (APPROVED)
    // Note: In Aisensy, you must create a "Campaign" from the template first
    // The campaignName should match your Campaign name in Aisensy dashboard
    // Parameters: [candidateName, jobRole, companyName, interviewUrl, companyName]
    const whatsappResponse = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: AISENSY_API_KEY,
        campaignName: "vantahire_interview_invitation",
        destination: cleanPhone,
        userName: displayName,
        templateParams: [
          displayName,       // Hi [Prafulla Deori],
          jobRole,           // [Technical Recruiter] role
          companyName,       // at [Vantahire.com]
          interviewUrl,      // [zoom.in/abc] link
          companyName        // [Vantahire] Team sign-off
        ],
        source: "Vantahire",
        media: {}
      }),
    });

    console.log("Aisensy API request sent for:", cleanPhone);

    const responseData = await whatsappResponse.json();
    
    // Extract message ID from Aisensy response
    const messageId = responseData?.data?.messageId || responseData?.messageId || null;
    
    if (!whatsappResponse.ok) {
      console.error("Aisensy API error:", responseData);
      
      // Store failed message in tracking table
      await supabaseAdmin.from("whatsapp_messages").insert({
        interview_id: interviewId,
        candidate_phone: cleanPhone,
        message_id: messageId,
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: responseData.message || "Failed to send WhatsApp message"
      });
      
      throw new Error(responseData.message || "Failed to send WhatsApp message");
    }

    console.log("WhatsApp message sent successfully via Aisensy:", responseData);
    
    // Store successful message in tracking table
    const { error: insertError } = await supabaseAdmin.from("whatsapp_messages").insert({
      interview_id: interviewId,
      candidate_phone: cleanPhone,
      message_id: messageId,
      status: "sent",
      sent_at: new Date().toISOString()
    });
    
    if (insertError) {
      console.error("Failed to store WhatsApp message tracking:", insertError);
    }

    return new Response(JSON.stringify({ success: true, data: responseData, messageId }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-whatsapp-invite function:", error);
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
