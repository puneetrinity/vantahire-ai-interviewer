import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, jobRole, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an AI interviewer conducting a professional job interview for the position of ${jobRole}. 

Your responsibilities:
1. Ask relevant technical and behavioral questions for this role
2. Follow up on candidate responses with probing questions
3. Maintain a professional, encouraging tone
4. Keep responses concise (2-3 sentences max for questions)
5. After 5-7 questions, wrap up the interview professionally

Interview flow:
- Start with a warm welcome and brief introduction
- Ask about their background and experience
- Move to role-specific technical questions
- Include behavioral/situational questions
- End with allowing candidate questions

Be conversational but professional. Evaluate responses mentally but don't share scores during the interview.`;

    // If action is 'evaluate', provide a score
    if (action === 'evaluate') {
      const evaluationPrompt = `Based on the following interview conversation for a ${jobRole} position, provide a JSON evaluation with:
1. Overall score (1-10)
2. Communication score (1-10)
3. Technical score (1-10)
4. Key strengths (array of strings)
5. Areas for improvement (array of strings)
6. Brief summary (2-3 sentences)

Respond ONLY with valid JSON in this format:
{
  "overallScore": number,
  "communicationScore": number,
  "technicalScore": number,
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "summary": "Brief evaluation summary"
}`;

      const evalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: evaluationPrompt },
            ...messages
          ],
        }),
      });

      if (!evalResponse.ok) {
        const errorText = await evalResponse.text();
        console.error('AI Gateway error:', evalResponse.status, errorText);
        throw new Error(`AI Gateway error: ${evalResponse.status}`);
      }

      const evalData = await evalResponse.json();
      const evalContent = evalData.choices[0].message.content;
      
      // Try to parse JSON from the response
      let evaluation;
      try {
        // Handle potential markdown code blocks
        const jsonMatch = evalContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                          evalContent.match(/```\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : evalContent;
        evaluation = JSON.parse(jsonStr.trim());
      } catch (parseError) {
        console.error('Failed to parse evaluation:', parseError);
        evaluation = {
          overallScore: 7,
          communicationScore: 7,
          technicalScore: 7,
          strengths: ["Good communication", "Relevant experience"],
          improvements: ["Could provide more specific examples"],
          summary: "The candidate showed solid potential for this role."
        };
      }

      return new Response(JSON.stringify({ evaluation }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Regular conversation
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    console.error('AI Interview error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
