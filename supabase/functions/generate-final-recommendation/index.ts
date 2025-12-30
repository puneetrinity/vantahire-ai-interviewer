import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FinalRecommendation {
  overallAssessment: string;
  hiringRecommendation: "Strongly Recommend" | "Recommend" | "Proceed with Caution" | "Do Not Recommend";
  confidenceScore: number;
  keyFindings: {
    consistencies: string[];
    discrepancies: string[];
  };
  communicationAnalysis: {
    clarity: number;
    confidence: number;
    professionalTone: number;
    observations: string[];
  };
  technicalAssessment: {
    score: number;
    strengths: string[];
    gaps: string[];
  };
  cultureFitIndicators: string[];
  redFlags: string[];
  greenFlags: string[];
  finalVerdict: string;
  suggestedNextSteps: string[];
}

interface AIResponse {
  content: string;
  provider: string;
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<AIResponse | null> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY not configured, skipping Gemini");
    return null;
  }

  console.log("Attempting Gemini API...");
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4000,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    
    if (response.status === 429 || response.status === 503) {
      console.log("Gemini rate limited or unavailable, will try fallback");
      return null;
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      console.error("Gemini API key invalid or unauthorized");
      return null;
    }
    return null;
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    console.error("No content in Gemini response");
    return null;
  }

  return { content, provider: "Gemini" };
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<AIResponse | null> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY not configured, skipping OpenAI");
    return null;
  }

  console.log("Attempting OpenAI (fallback)...");
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 4000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("All AI providers rate limited. Please try again later.");
    }
    if (response.status === 402 || response.status === 401) {
      throw new Error("OpenAI API key invalid or payment required.");
    }
    return null;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error("No content in OpenAI response");
    return null;
  }

  return { content, provider: "OpenAI" };
}

function parseRecommendation(content: string): FinalRecommendation {
  let jsonStr = content.trim();
  // Remove markdown code blocks if present
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  return JSON.parse(jsonStr.trim());
}

function getFallbackRecommendation(): FinalRecommendation {
  return {
    overallAssessment: "Analysis completed but structured output could not be generated. Please review the transcripts manually.",
    hiringRecommendation: "Proceed with Caution",
    confidenceScore: 50,
    keyFindings: {
      consistencies: ["Transcript analysis available"],
      discrepancies: ["Unable to perform detailed comparison"]
    },
    communicationAnalysis: {
      clarity: 5,
      confidence: 5,
      professionalTone: 5,
      observations: ["Manual review recommended"]
    },
    technicalAssessment: {
      score: 5,
      strengths: ["Requires manual evaluation"],
      gaps: ["Requires manual evaluation"]
    },
    cultureFitIndicators: ["Requires manual evaluation"],
    redFlags: [],
    greenFlags: [],
    finalVerdict: "Please review the interview transcripts manually for a complete assessment.",
    suggestedNextSteps: ["Review video recording", "Conduct follow-up interview if needed"]
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoTranscription, chatTranscript, candidateName, jobRole, existingSummary } = await req.json();

    if (!videoTranscription && !chatTranscript) {
      throw new Error("At least one transcript is required");
    }

    console.log("Generating final recommendation for:", candidateName, jobRole);

    const systemPrompt = `You are an expert HR analyst and interview evaluator. Your task is to analyze interview transcripts and provide a comprehensive, data-driven hiring recommendation.

You will receive:
1. Video transcription (actual spoken words from the interview recording)
2. Chat transcript (text-based conversation from the AI interview)
3. Candidate and role information
4. Any existing summary data

Your analysis should:
- Compare both transcripts for consistency
- Identify key strengths and concerns
- Provide a clear, actionable hiring recommendation
- Rate confidence in your assessment
- Highlight any discrepancies between video and chat
- Consider communication skills, technical abilities, and cultural fit

Be objective, specific, and evidence-based in your analysis.`;

    const userPrompt = `Analyze the following interview data and provide a comprehensive final recommendation:

CANDIDATE: ${candidateName || "Unknown"}
POSITION: ${jobRole || "Unknown"}

VIDEO TRANSCRIPTION (Speech-to-Text):
${videoTranscription || "Not available"}

CHAT TRANSCRIPT:
${chatTranscript || "Not available"}

${existingSummary ? `EXISTING SUMMARY DATA:
${JSON.stringify(existingSummary, null, 2)}` : ""}

Please provide your analysis in the following JSON format:
{
  "overallAssessment": "A 2-3 sentence summary of the candidate's overall interview performance",
  "hiringRecommendation": "One of: 'Strongly Recommend', 'Recommend', 'Proceed with Caution', 'Do Not Recommend'",
  "confidenceScore": 85,
  "keyFindings": {
    "consistencies": ["Areas where video and chat align well"],
    "discrepancies": ["Any differences noted between video and chat"]
  },
  "communicationAnalysis": {
    "clarity": 8,
    "confidence": 7,
    "professionalTone": 9,
    "observations": ["Specific observations about communication style"]
  },
  "technicalAssessment": {
    "score": 7,
    "strengths": ["Technical strengths demonstrated"],
    "gaps": ["Areas needing improvement"]
  },
  "cultureFitIndicators": ["Positive cultural fit indicators"],
  "redFlags": ["Any concerns or warning signs"],
  "greenFlags": ["Positive indicators"],
  "finalVerdict": "A clear, concise final recommendation statement",
  "suggestedNextSteps": ["Recommended next steps in the hiring process"]
}

Return ONLY valid JSON, no other text.`;

    // Try Gemini first, then fall back to Lovable AI
    let aiResponse = await callGemini(systemPrompt, userPrompt);
    
    if (!aiResponse) {
      console.log("Gemini failed, falling back to OpenAI...");
      aiResponse = await callOpenAI(systemPrompt, userPrompt);
    }

    if (!aiResponse) {
      throw new Error("All AI providers failed. Please try again later.");
    }

    console.log(`Successfully got response from ${aiResponse.provider}`);
    console.log("Raw AI response:", aiResponse.content);

    // Parse JSON from response
    let recommendation: FinalRecommendation;
    try {
      recommendation = parseRecommendation(aiResponse.content);
    } catch (parseError) {
      console.error(`Failed to parse ${aiResponse.provider} response:`, parseError);
      recommendation = getFallbackRecommendation();
    }

    console.log("Generated recommendation:", recommendation);

    return new Response(JSON.stringify({ recommendation, provider: aiResponse.provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error generating recommendation:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const status = errorMessage.includes("rate limited") ? 429 : 
                   errorMessage.includes("credits") ? 402 : 500;
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
