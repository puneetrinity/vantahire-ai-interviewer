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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoTranscription, chatTranscript, candidateName, jobRole, existingSummary } = await req.json();

    if (!videoTranscription && !chatTranscript) {
      throw new Error("At least one transcript is required");
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log("Generating final recommendation using Gemini for:", candidateName, jobRole);

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
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: "Gemini API key invalid or unauthorized." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("No content in Gemini response");
    }

    console.log("Raw Gemini response:", content);

    // Parse JSON from response (handle markdown code blocks)
    let recommendation: FinalRecommendation;
    try {
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
      recommendation = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
      // Return a fallback recommendation
      recommendation = {
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

    console.log("Generated recommendation:", recommendation);

    return new Response(JSON.stringify({ recommendation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error generating recommendation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
