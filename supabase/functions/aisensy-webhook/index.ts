import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Aisensy webhook payload types
interface AisensyWebhookPayload {
  messageId?: string;
  status?: string;
  destination?: string;
  timestamp?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing backend environment configuration");
    }

    const payload: AisensyWebhookPayload = await req.json();
    
    console.log("Received Aisensy webhook:", JSON.stringify(payload));

    const messageId = payload.messageId;
    const status = payload.status?.toLowerCase();

    if (!messageId) {
      console.warn("Webhook missing messageId");
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Map Aisensy status to our status
    let updateData: Record<string, any> = {};
    
    switch (status) {
      case "sent":
        updateData = { status: "sent", sent_at: new Date().toISOString() };
        break;
      case "delivered":
        updateData = { status: "delivered", delivered_at: new Date().toISOString() };
        break;
      case "read":
        updateData = { status: "read", read_at: new Date().toISOString() };
        break;
      case "failed":
      case "undelivered":
        updateData = {
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: payload.error?.message || "Delivery failed"
        };
        break;
      default:
        console.log(`Unknown status: ${status}`);
        updateData = { status: status || "unknown" };
    }

    // Update the message status
    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_messages")
      .update(updateData)
      .eq("message_id", messageId);

    if (updateError) {
      console.error("Failed to update WhatsApp message status:", updateError);
    } else {
      console.log(`Updated message ${messageId} to status: ${status}`);
    }

    return new Response(JSON.stringify({ received: true, status }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in aisensy-webhook:", error);
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
