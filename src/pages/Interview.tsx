import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCandidateAuth } from "@/hooks/useCandidateAuth";
import { validateMessageContent } from "@/lib/validateInput";
import AppLayout from "@/components/AppLayout";
import { Send, Bot, User, Loader2, CheckCircle, XCircle } from "lucide-react";

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface Interview {
  id: string;
  job_role: string;
  status: string;
  score: number | null;
  started_at: string | null;
  completed_at: string | null;
  time_limit_minutes: number | null;
  expires_at: string | null;
}

interface Evaluation {
  overallScore: number;
  communicationScore: number;
  technicalScore: number;
  strengths: string[];
  improvements: string[];
  summary: string;
}

const Interview = () => {
  const { id } = useParams<{ id: string }>();
  
  // Use anonymous auth for candidates
  const { user, isLoading: authLoading, isLinkedToInterview, error: authError } = useCandidateAuth(id);
  
  const [interview, setInterview] = useState<Interview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Wait for auth before fetching interview
  useEffect(() => {
    if (authLoading) return;
    
    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }
    
    if (!isLinkedToInterview) {
      setError("Unable to access this interview. Please check the link and try again.");
      setLoading(false);
      return;
    }
    
    if (id && user) {
      fetchInterview();
    }
  }, [id, authLoading, authError, isLinkedToInterview, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchInterview = async () => {
    try {
      // Use secure function that only returns safe columns for candidates
      const { data, error } = await supabase
        .rpc("get_candidate_interview_safe", { p_interview_id: id });

      if (error) throw error;
      if (!data || data.length === 0) {
        setError("Interview not found");
        return;
      }

      const interviewData = data[0] as Interview;
      setInterview(interviewData);

      // Check if interview is already completed
      if (interviewData.status === "completed") {
        // Fetch existing messages
        const { data: messagesData } = await supabase
          .from("interview_messages")
          .select("*")
          .eq("interview_id", id)
          .order("created_at", { ascending: true });

        if (messagesData) {
          setMessages(messagesData.filter(m => m.role !== "system").map(m => ({
            role: m.role as "assistant" | "user",
            content: m.content
          })));
        }
      } else if (interviewData.status === "pending") {
        // Start the interview
        await startInterview(interviewData);
      } else if (interviewData.status === "in_progress") {
        // Fetch existing messages
        const { data: messagesData } = await supabase
          .from("interview_messages")
          .select("*")
          .eq("interview_id", id)
          .order("created_at", { ascending: true });

        if (messagesData && messagesData.length > 0) {
          setMessages(messagesData.filter(m => m.role !== "system").map(m => ({
            role: m.role as "assistant" | "user",
            content: m.content
          })));
        } else {
          await startInterview(interviewData);
        }
      }
    } catch (error: any) {
      console.error("Error fetching interview:", error);
      setError("Failed to load interview");
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async (interviewData: Interview) => {
    try {
      // Update status to in_progress using RPC function
      const { error: statusError } = await supabase.rpc('update_interview_status', {
        p_interview_id: interviewData.id,
        p_status: 'in_progress'
      });

      if (statusError) {
        console.error("Failed to update interview status:", statusError);
        throw new Error("Could not start interview. Please try again.");
      }

      setInterview({ ...interviewData, status: "in_progress", started_at: new Date().toISOString() });

      // Get first message from AI
      await sendMessage([], interviewData.job_role, true);
    } catch (error: any) {
      console.error("Error starting interview:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to start interview"
      });
    }
  };

  const sendMessage = async (
    currentMessages: Message[],
    jobRole: string,
    isInitial = false
  ) => {
    setIsStreaming(true);

    try {
      // Get the current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Authentication required");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-interview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: currentMessages,
            jobRole: jobRole,
            interviewId: id,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantMessage = "";

      // Add empty assistant message to start streaming
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    role: "assistant",
                    content: assistantMessage,
                  };
                  return newMessages;
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Validate and save message to database
      if (assistantMessage) {
        const validation = validateMessageContent(assistantMessage);
        if (validation.valid) {
          await supabase.from("interview_messages").insert({
            interview_id: id,
            role: "assistant",
            content: validation.sanitized!,
          });
        }
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to get response",
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || sending || isStreaming || !interview) return;

    // Validate input
    const validation = validateMessageContent(input);
    if (!validation.valid) {
      toast({
        variant: "destructive",
        title: "Invalid Message",
        description: validation.error,
      });
      return;
    }

    const userMessage = validation.sanitized!;
    setInput("");
    setSending(true);

    // Add user message
    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);

    // Save to database
    await supabase.from("interview_messages").insert({
      interview_id: id,
      role: "user",
      content: userMessage,
    });

    setSending(false);

    // Check if we should end the interview (after ~6 exchanges)
    const userMessageCount = newMessages.filter((m) => m.role === "user").length;
    if (userMessageCount >= 6) {
      await endInterview(newMessages);
    } else {
      await sendMessage(newMessages, interview.job_role);
    }
  };

  const endInterview = async (finalMessages: Message[]) => {
    setIsStreaming(true);

    try {
      // Get the current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Authentication required");
      }

      // Get evaluation
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-interview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: finalMessages,
            jobRole: interview?.job_role,
            action: "evaluate",
            interviewId: id,
          }),
        }
      );

      const data = await response.json();
      
      if (data.evaluation) {
        setEvaluation(data.evaluation);

        // Update interview status and score using RPC function
        const { error: updateError } = await supabase.rpc('update_interview_status', {
          p_interview_id: id,
          p_status: 'completed',
          p_score: data.evaluation.overallScore
        });

        if (updateError) {
          console.error("Failed to update interview status:", updateError);
        }

        setInterview((prev) =>
          prev ? { ...prev, status: "completed", score: data.evaluation.overallScore } : null
        );
      }
    } catch (error: any) {
      console.error("Error ending interview:", error);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Show loading while auth is in progress
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading interview...
        </div>
      </div>
    );
  }

  if (error || authError || !interview) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{error || authError || "Interview not found"}</h2>
          <p className="text-muted-foreground">Please check the link and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <AppLayout
      fullHeight
      footer="minimal"
      headerRightContent={
        <div className="text-right">
          <div className="text-sm font-medium text-foreground">{interview.job_role}</div>
          <div className="text-xs text-muted-foreground capitalize">
            {interview.status.replace("_", " ")}
          </div>
        </div>
      }
      containerClassName="max-w-3xl"
    >
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-3 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "gradient-bg text-primary-foreground"
                  }`}
                >
                  {message.role === "user" ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] p-4 rounded-2xl ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Evaluation Result */}
        {evaluation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 p-6 rounded-2xl bg-card border border-border"
          >
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold text-foreground">Interview Complete</h3>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-secondary">
                <div className="text-2xl font-bold gradient-text">{evaluation.overallScore}/10</div>
                <div className="text-xs text-muted-foreground">Overall</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary">
                <div className="text-2xl font-bold text-foreground">{evaluation.communicationScore}/10</div>
                <div className="text-xs text-muted-foreground">Communication</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary">
                <div className="text-2xl font-bold text-foreground">{evaluation.technicalScore}/10</div>
                <div className="text-xs text-muted-foreground">Technical</div>
              </div>
            </div>

            <p className="text-muted-foreground mb-4">{evaluation.summary}</p>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Strengths</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Areas to Improve</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {evaluation.improvements.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground flex-shrink-0 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {/* Input */}
        {interview.status !== "completed" && (
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              className="min-h-[60px] max-h-[120px] resize-none"
              disabled={isStreaming || sending}
              maxLength={10000}
            />
            <Button
              variant="hero"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || sending}
              className="h-auto"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        )}
      </AppLayout>
  );
};

export default Interview;
