import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Zap, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Phone, 
  PhoneOff,
  Loader2, 
  XCircle,
  Volume2,
  User
} from "lucide-react";

interface Interview {
  id: string;
  candidate_email: string;
  candidate_name: string | null;
  job_role: string;
  status: string;
  score: number | null;
}

const ELEVENLABS_AGENT_ID = "agent_3501kdkg4t5qfppvw6h1ve94teyq";

const VoiceInterview = () => {
  const { id } = useParams<{ id: string }>();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to ElevenLabs agent");
      toast({ title: "Connected", description: "AI interviewer is ready" });
    },
    onDisconnect: () => {
      console.log("Disconnected from agent");
      handleInterviewEnd();
    },
    onMessage: (message: any) => {
      console.log("Message:", message);
      // Handle transcript messages
      if (message.message) {
        const role = message.source === "user" ? "user" : "assistant";
        setTranscript(prev => [...prev, { role, text: message.message }]);
        
        // Save to database
        supabase.from("interview_messages").insert({
          interview_id: id,
          role,
          content: message.message,
        });
      }
    },
    onError: (error: any) => {
      console.error("Conversation error:", error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Failed to connect to AI interviewer. Please try again.",
      });
    },
  });

  useEffect(() => {
    if (id) {
      fetchInterview();
    }
    return () => {
      stopVideo();
      conversation.endSession();
    };
  }, [id]);

  const fetchInterview = async () => {
    try {
      const { data, error } = await supabase
        .from("interviews")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setError("Interview not found");
        return;
      }

      setInterview(data);
    } catch (error: any) {
      console.error("Error fetching interview:", error);
      setError("Failed to load interview");
    } finally {
      setLoading(false);
    }
  };

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false, // Audio handled by ElevenLabs
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setVideoEnabled(true);
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Could not access camera. Please check permissions.",
      });
    }
  };

  const stopVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoEnabled(false);
  };

  const toggleVideo = () => {
    if (videoEnabled) {
      stopVideo();
    } else {
      startVideo();
    }
  };

  const startInterview = useCallback(async () => {
    if (!ELEVENLABS_AGENT_ID) {
      toast({
        variant: "destructive",
        title: "Configuration Required",
        description: "Please configure your ElevenLabs Agent ID first.",
      });
      return;
    }

    setIsConnecting(true);
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start video
      await startVideo();

      // Update interview status
      await supabase
        .from("interviews")
        .update({ status: "in_progress" })
        .eq("id", id);

      setInterview(prev => prev ? { ...prev, status: "in_progress" } : null);

      // Connect directly with agent ID (for public agents)
      // Make sure your agent is set to "Public" in ElevenLabs dashboard
      await conversation.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        connectionType: "webrtc",
      });
    } catch (error: any) {
      console.error("Failed to start interview:", error);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: error.message || "Could not start the interview. Please try again.",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [conversation, id, toast]);

  const endInterview = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const handleInterviewEnd = async () => {
    stopVideo();
    
    // Update interview status
    await supabase
      .from("interviews")
      .update({ 
        status: "completed",
        score: 7.5 // TODO: Get actual score from AI evaluation
      })
      .eq("id", id);

    setInterview(prev => prev ? { ...prev, status: "completed" } : null);

    toast({
      title: "Interview Complete",
      description: "Thank you for completing the interview!",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading interview...
        </div>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{error || "Interview not found"}</h2>
          <p className="text-muted-foreground">Please check the link and try again.</p>
        </div>
      </div>
    );
  }

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  return (
    <div className="min-h-screen bg-foreground text-primary-foreground">
      {/* Header */}
      <header className="border-b border-primary-foreground/10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-bg flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">InterviewAI</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{interview.job_role}</div>
            <div className="text-xs text-primary-foreground/60 capitalize">
              {interview.status === "in_progress" ? "In Progress" : interview.status}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Video Panel */}
          <div className="lg:col-span-2 space-y-4">
            {/* AI Interviewer Status */}
            <motion.div 
              className={`p-6 rounded-2xl border ${
                isSpeaking 
                  ? "border-primary bg-primary/10" 
                  : "border-primary-foreground/10 bg-primary-foreground/5"
              } transition-all`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full gradient-bg flex items-center justify-center ${
                  isSpeaking ? "animate-pulse" : ""
                }`}>
                  <Volume2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">AI Interviewer</h3>
                  <p className="text-sm text-primary-foreground/60">
                    {!isConnected 
                      ? "Waiting to start..." 
                      : isSpeaking 
                        ? "Speaking..." 
                        : "Listening..."}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Candidate Video */}
            <div className="relative aspect-video bg-primary-foreground/5 rounded-2xl overflow-hidden border border-primary-foreground/10">
              {videoEnabled ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-primary-foreground/10 flex items-center justify-center">
                    <User className="w-12 h-12 text-primary-foreground/40" />
                  </div>
                </div>
              )}

              {/* Candidate Name Overlay */}
              <div className="absolute bottom-4 left-4 px-3 py-1 rounded-lg bg-foreground/80 backdrop-blur-sm">
                <span className="text-sm font-medium">
                  {interview.candidate_name || "Candidate"}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="lg"
                onClick={toggleVideo}
                className={`rounded-full w-14 h-14 ${!videoEnabled ? "bg-destructive text-destructive-foreground" : "bg-primary-foreground/10"}`}
              >
                {videoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
              </Button>

              {!isConnected ? (
                <Button
                  variant="hero"
                  size="lg"
                  onClick={startInterview}
                  disabled={isConnecting || interview.status === "completed"}
                  className="rounded-full px-8"
                >
                  {isConnecting ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Phone className="w-5 h-5 mr-2" />
                  )}
                  {interview.status === "completed" ? "Interview Completed" : "Start Interview"}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={endInterview}
                  className="rounded-full px-8"
                >
                  <PhoneOff className="w-5 h-5 mr-2" />
                  End Interview
                </Button>
              )}

              <div className={`rounded-full w-14 h-14 flex items-center justify-center ${
                isConnected ? "bg-accent text-accent-foreground" : "bg-primary-foreground/10"
              }`}>
                {isConnected ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </div>
            </div>
          </div>

          {/* Transcript Panel */}
          <div className="bg-primary-foreground/5 rounded-2xl border border-primary-foreground/10 p-6">
            <h3 className="text-lg font-semibold mb-4">Live Transcript</h3>
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {transcript.length === 0 ? (
                <p className="text-sm text-primary-foreground/40 text-center py-8">
                  Transcript will appear here when the interview starts...
                </p>
              ) : (
                <AnimatePresence>
                  {transcript.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-lg ${
                        item.role === "user"
                          ? "bg-primary/20 ml-4"
                          : "bg-primary-foreground/10 mr-4"
                      }`}
                    >
                      <p className="text-xs text-primary-foreground/60 mb-1">
                        {item.role === "user" ? "You" : "AI Interviewer"}
                      </p>
                      <p className="text-sm">{item.text}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default VoiceInterview;
