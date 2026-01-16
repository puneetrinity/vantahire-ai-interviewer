import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { interviews as interviewsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { validateMessageContent } from "@/lib/validateInput";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import PageErrorState from "@/components/PageErrorState";
import { Send, Bot, User, Loader2, CheckCircle } from "lucide-react";

interface Message {
  role: "assistant" | "user";
  content: string;
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

  // Use token-based auth for candidates
  const {
    interview: authInterview,
    isLoading: authLoading,
    isAuthenticated,
    error: authError,
  } = useInterviewSession(id);

  const [interview, setInterview] = useState<{
    id: string;
    jobRole: string;
    status: string;
    score: number | null;
    startedAt: string | null;
    completedAt: string | null;
    timeLimitMinutes: number | null;
  } | null>(null);
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

    if (!isAuthenticated) {
      setError("Unable to access this interview. Please check the link and try again.");
      setLoading(false);
      return;
    }

    if (id && authInterview) {
      initializeInterview();
    }
  }, [id, authLoading, authError, isAuthenticated, authInterview]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const initializeInterview = async () => {
    try {
      if (!authInterview) {
        setError("Interview not found");
        return;
      }

      // Convert from API format
      const interviewData = {
        id: authInterview.id,
        jobRole: authInterview.jobRole,
        status: authInterview.status,
        score: null as number | null,
        startedAt: authInterview.startedAt,
        completedAt: null as string | null,
        timeLimitMinutes: authInterview.timeLimitMinutes,
      };
      setInterview(interviewData);

      // Check if interview is already completed
      if (interviewData.status === "COMPLETED") {
        // Fetch existing messages
        const messagesData = await interviewsApi.candidate.getMessages();
        setMessages(
          messagesData
            .filter((m) => m.role !== "system")
            .map((m) => ({
              role: m.role as "assistant" | "user",
              content: m.content,
            }))
        );
      } else if (interviewData.status === "PENDING") {
        // Start the interview
        await startInterview(interviewData);
      } else if (interviewData.status === "IN_PROGRESS") {
        // Fetch existing messages
        const messagesData = await interviewsApi.candidate.getMessages();
        if (messagesData && messagesData.length > 0) {
          setMessages(
            messagesData
              .filter((m) => m.role !== "system")
              .map((m) => ({
                role: m.role as "assistant" | "user",
                content: m.content,
              }))
          );
        } else {
          await startInterview(interviewData);
        }
      }
    } catch (error: any) {
      console.error("Error initializing interview:", error);
      setError("Failed to load interview");
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async (interviewData: typeof interview) => {
    if (!interviewData) return;

    try {
      // Start the interview via API
      const { status, startedAt } = await interviewsApi.candidate.start();

      setInterview({
        ...interviewData,
        status,
        startedAt,
      });

      // Get first message from AI by sending empty initial message
      setIsStreaming(true);
      const response = await interviewsApi.candidate.sendMessage("");

      if (response.aiMessage) {
        setMessages([
          {
            role: "assistant",
            content: response.aiMessage.content,
          },
        ]);
      }
    } catch (error: any) {
      console.error("Error starting interview:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to start interview",
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

    // Add user message optimistically
    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);

    try {
      setIsStreaming(true);

      // Send message via API
      const response = await interviewsApi.candidate.sendMessage(userMessage);

      // Add AI response
      if (response.aiMessage) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.aiMessage.content },
        ]);
      }

      // Check if we should end the interview (after ~6 exchanges)
      const userMessageCount = newMessages.filter((m) => m.role === "user").length;
      if (userMessageCount >= 6) {
        await endInterview();
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to get response",
      });
    } finally {
      setSending(false);
      setIsStreaming(false);
    }
  };

  const endInterview = async () => {
    setIsStreaming(true);

    try {
      // Complete the interview via API
      const { status } = await interviewsApi.candidate.complete();

      setInterview((prev) =>
        prev ? { ...prev, status, completedAt: new Date().toISOString() } : null
      );

      // The API will trigger evaluation generation on the backend
      // For now just show a completion message
      toast({
        title: "Interview Complete",
        description: "Thank you for completing the interview!",
      });
    } catch (error: any) {
      console.error("Error ending interview:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to complete interview",
      });
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
    return <PageLoadingSkeleton variant="interview" showFooter />;
  }

  if (error || authError || !interview) {
    return (
      <PageErrorState
        variant="not-found"
        title={error || authError || "Interview not found"}
        description="Please check the link and try again."
        showFooter
      />
    );
  }

  return (
    <AppLayout
      fullHeight
      footer="minimal"
      headerRightContent={
        <div className="text-right">
          <div className="text-sm font-medium text-foreground">{interview.jobRole}</div>
          <div className="text-xs text-muted-foreground capitalize">
            {interview.status.replace("_", " ").toLowerCase()}
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
              <div className="text-2xl font-bold text-foreground">
                {evaluation.communicationScore}/10
              </div>
              <div className="text-xs text-muted-foreground">Communication</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary">
              <div className="text-2xl font-bold text-foreground">
                {evaluation.technicalScore}/10
              </div>
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
      {interview.status !== "COMPLETED" && (
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
