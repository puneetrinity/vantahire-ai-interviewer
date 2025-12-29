import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImproveEmailRequest {
  currentIntro?: string;
  currentTips?: string;
  currentCta?: string;
  companyName?: string;
  tone?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentIntro, currentTips, currentCta, companyName, tone = "professional" }: ImproveEmailRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const company = companyName || "our company";
    
    const systemPrompt = `You are an expert copywriter specializing in recruitment and HR communications. 
Your task is to improve email copy for candidate interview invitations.
Keep the tone ${tone} but warm and inviting.
The copy should be concise, clear, and encourage candidates to complete their interview.
Do not use excessive enthusiasm or exclamation marks.
Focus on making the candidate feel valued and informed.`;

    const userPrompt = `Please improve the following email copy for a candidate interview invitation from ${company}. 
If any field is empty, generate appropriate content.

Current intro paragraph (shown after "Hello [Name]!"):
${currentIntro || "You've been invited to complete an AI-powered interview for the [Job Role] position."}

Current tips section:
${currentTips || "Find a quiet place with a stable internet connection. Speak clearly and take your time with each response."}

Current CTA button text:
${currentCta || "Start Your Interview"}

Return a JSON object with improved versions:
{
  "intro": "improved intro paragraph (1-2 sentences, don't include greeting)",
  "tips": "improved tips (2-3 practical tips in one paragraph)",
  "cta": "improved CTA button text (2-4 words)"
}`;

    console.log("Calling Lovable AI to improve email copy");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to get AI response");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log("AI response:", content);

    // Parse JSON from response
    let improved;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        improved = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Return defaults if parsing fails
      improved = {
        intro: "We're excited to invite you to complete an AI-powered interview for this position. This is your opportunity to showcase your skills and experience.",
        tips: "Choose a quiet environment with reliable internet. Take your time with each response and speak naturally - there's no rush.",
        cta: "Begin Interview"
      };
    }

    return new Response(JSON.stringify({ success: true, improved }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in improve-email-copy function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
