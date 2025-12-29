import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCandidateAuth } from "@/hooks/useCandidateAuth";
import { validateMessageContent, validateNotes } from "@/lib/validateInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  User,
  Upload,
  FileText,
  Clock,
  AlertTriangle,
  Send,
  MessageSquare,
  Paperclip,
  RefreshCw,
  WifiOff
} from "lucide-react";

interface Interview {
  id: string;
  job_role: string;
  status: string;
  score: number | null;
  time_limit_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  candidate_resume_url: string | null;
  candidate_notes: string | null;
}

const ELEVENLABS_AGENT_ID = "agent_3501kdkg4t5qfppvw6h1ve94teyq";
const DEFAULT_TIME_LIMIT = 30; // 30 minutes

const VoiceInterview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Use anonymous auth for candidates
  const { user, isLoading: authLoading, isLinkedToInterview, error: authError } = useCandidateAuth(id);
  
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [showPreInterview, setShowPreInterview] = useState(true);
  const [candidateNotes, setCandidateNotes] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [chatUploadedFile, setChatUploadedFile] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showEndConfirmDialog, setShowEndConfirmDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const intentionalDisconnectRef = useRef(false);
  const maxReconnectAttempts = 3;
  const { toast } = useToast();
  const contextSentRef = useRef(false);

  // Build context string from interview data and candidate notes
  const buildInterviewContext = useCallback(() => {
    if (!interview) return null;
    
    let context = `INTERVIEW CONTEXT:\n`;
    context += `- Job Role: ${interview.job_role}\n`;
    
    if (candidateNotes.trim()) {
      context += `\nCANDIDATE PROVIDED INFORMATION:\n${candidateNotes}\n`;
    }
    
    if (interview.candidate_notes && interview.candidate_notes !== candidateNotes) {
      context += `\nADDITIONAL NOTES:\n${interview.candidate_notes}\n`;
    }
    
    context += `\nIMPORTANT: The candidate has already shared this information. Use it to tailor your interview questions. Do NOT ask them to share their resume or job description again - you already have this context.`;
    
    return context;
  }, [interview, candidateNotes]);

  // Track pending message saves
  const pendingMessagesRef = useRef<Promise<void>[]>([]);
  
  // Ref to hold handleInterviewEnd to avoid circular dependency
  const handleInterviewEndRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to ElevenLabs agent");
      setReconnectAttempts(0);
      toast({ title: "Connected", description: "AI interviewer is ready" });
    },
    onDisconnect: () => {
      console.log("Disconnected from agent, intentional:", intentionalDisconnectRef.current);
      
      // Only show dialog if it was NOT an intentional disconnect
      if (!intentionalDisconnectRef.current && interview?.status === "in_progress") {
        setShowDisconnectDialog(true);
        toast({
          variant: "destructive",
          title: "Connection Lost",
          description: "The connection to the AI interviewer was interrupted.",
        });
      }
    },
    onMessage: (message: any) => {
      console.log("ElevenLabs Message:", message.type, message);
      
      let role: string | null = null;
      let content: string | null = null;
      
      // Handle different message formats from ElevenLabs
      if (message.message) {
        // Standard message format
        role = message.source === "user" ? "user" : "assistant";
        content = message.message;
      } else if (message.type === "agent_response" && message.agent_response_event?.agent_response) {
        // Agent response event format
        role = "assistant";
        content = message.agent_response_event.agent_response;
      } else if (message.type === "user_transcript" && message.user_transcription_event?.user_transcript) {
        // User transcript from voice - already saved via sendChatMessage, skip to avoid duplicates
        console.log("User transcript received (voice):", message.user_transcription_event.user_transcript);
        return;
      }
      
      if (!role || !content) {
        return;
      }
      
      // Validate message content
      const validation = validateMessageContent(content);
      if (!validation.valid) {
        console.error("Invalid message content:", validation.error);
        return;
      }
      
      setTranscript(prev => [...prev, { role, text: validation.sanitized! }]);
      
      // Track the promise so we can wait for all messages to be saved
      const savePromise = new Promise<void>((resolve) => {
        supabase.from("interview_messages").insert({
          interview_id: id,
          role,
          content: validation.sanitized!,
        }).then(({ error }) => {
          if (error) {
            console.error("Failed to save message:", error);
          } else {
            console.log("Message saved successfully:", role);
          }
          resolve();
        });
      });
      pendingMessagesRef.current.push(savePromise);
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

  const attemptReconnect = useCallback(async () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      toast({
        variant: "destructive",
        title: "Connection Lost",
        description: "Unable to reconnect after multiple attempts. Please refresh and try again.",
      });
      setShowDisconnectDialog(false);
      return;
    }

    setIsReconnecting(true);
    setReconnectAttempts(prev => prev + 1);

    try {
      console.log(`Reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts}`);
      
      await conversation.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        connectionType: "webrtc",
      });

      // Re-send context after reconnection
      const context = buildInterviewContext();
      if (context) {
        setTimeout(() => {
          try {
            conversation.sendContextualUpdate(context);
            console.log("Context re-sent after reconnection");
          } catch (e) {
            console.log("Could not re-send contextual update:", e);
          }
        }, 1000);
      }

      setShowDisconnectDialog(false);
      setReconnectAttempts(0);
      toast({
        title: "Reconnected",
        description: "Successfully reconnected to the AI interviewer.",
      });
    } catch (error) {
      console.error("Reconnect failed:", error);
      toast({
        variant: "destructive",
        title: "Reconnect Failed",
        description: `Attempt ${reconnectAttempts + 1} of ${maxReconnectAttempts} failed. Try again?`,
      });
    } finally {
      setIsReconnecting(false);
    }
  }, [reconnectAttempts, conversation, buildInterviewContext, toast]);

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
    
    return () => {
      stopVideo();
      conversation.endSession();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [id, authLoading, authError, isLinkedToInterview, user]);

  // Timer effect
  useEffect(() => {
    if (interview?.status === "in_progress" && interview.started_at) {
      const timeLimit = (interview.time_limit_minutes || DEFAULT_TIME_LIMIT) * 60 * 1000;
      const startTime = new Date(interview.started_at).getTime();
      
      const updateTimer = () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, timeLimit - elapsed);
        setTimeRemaining(Math.floor(remaining / 1000));
        
        if (remaining <= 0) {
          toast({
            variant: "destructive",
            title: "Time's Up!",
            description: "The interview time limit has been reached.",
          });
          endInterview();
        }
      };
      
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [interview?.status, interview?.started_at]);

  // Auto-redirect to dashboard after interview completion
  useEffect(() => {
    if (interview?.status === "completed" && !isGeneratingSummary) {
      setRedirectCountdown(5);
      
      const countdownInterval = setInterval(() => {
        setRedirectCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownInterval);
            navigate("/dashboard");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdownInterval);
    }
  }, [interview?.status, isGeneratingSummary, navigate]);

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
      if (interviewData.candidate_notes) {
        setCandidateNotes(interviewData.candidate_notes);
      }
      if (interviewData.status === "in_progress" || interviewData.status === "completed") {
        setShowPreInterview(false);
      }
    } catch (error: any) {
      console.error("Error fetching interview:", error);
      setError("Failed to load interview");
    } finally {
      setLoading(false);
    }
  };

  const startVideo = async () => {
    try {
      // Get video and audio for recording
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Mute to prevent feedback
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

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      console.error("No stream available for recording");
      return;
    }

    try {
      recordedChunksRef.current = [];
      
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 1000000, // 1 Mbps
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (error) => {
        console.error("MediaRecorder error:", error);
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      console.log("Recording started");
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        console.log("No active recording to stop");
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          console.log("Recording stopped, blob size:", blob.size);

          if (blob.size === 0) {
            console.log("Empty recording, skipping upload");
            resolve(null);
            return;
          }

          // Upload to Supabase storage
          const fileName = `${id}/recording-${Date.now()}.webm`;
          const { error: uploadError } = await supabase.storage
            .from('interview-documents')
            .upload(fileName, blob, {
              contentType: 'video/webm',
            });

          if (uploadError) {
            console.error("Failed to upload recording:", uploadError);
            resolve(null);
            return;
          }

          // Get signed URL instead of public URL (bucket is now private)
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('interview-documents')
            .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days expiration

          if (signedUrlError || !signedUrlData) {
            console.error("Failed to get signed URL:", signedUrlError);
            resolve(null);
            return;
          }

          // Update interview with recording URL (store the path, not the signed URL)
          await supabase
            .from('interviews')
            .update({ recording_url: fileName })
            .eq('id', id);

          console.log("Recording uploaded:", fileName);
          resolve(fileName);
        } catch (error) {
          console.error("Error processing recording:", error);
          resolve(null);
        } finally {
          recordedChunksRef.current = [];
          setIsRecording(false);
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [id]);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please upload a PDF, DOC, DOCX, or TXT file.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "File size must be less than 10MB.",
      });
      return;
    }

    setUploadedFile(file);
    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('interview-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Store the file path instead of public URL
      await supabase
        .from('interviews')
        .update({ candidate_resume_url: filePath })
        .eq('id', id);

      toast({
        title: "File Uploaded",
        description: "Your document has been uploaded successfully.",
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "Could not upload the file. Please try again.",
      });
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const saveNotes = async () => {
    // Validate notes
    const validation = validateNotes(candidateNotes);
    if (!validation.valid) {
      toast({
        variant: "destructive",
        title: "Invalid Notes",
        description: validation.error,
      });
      return;
    }

    if (!validation.sanitized?.trim()) return;

    try {
      await supabase
        .from('interviews')
        .update({ candidate_notes: validation.sanitized })
        .eq('id', id);

      toast({
        title: "Notes Saved",
        description: "Your notes have been saved.",
      });
    } catch (error) {
      console.error("Error saving notes:", error);
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

    // Save notes before starting
    if (candidateNotes.trim()) {
      await saveNotes();
    }

    setIsConnecting(true);
    setShowPreInterview(false);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await startVideo();

      const now = new Date().toISOString();
      await supabase
        .from("interviews")
        .update({ 
          status: "in_progress",
          started_at: now
        })
        .eq("id", id);

      setInterview(prev => prev ? { 
        ...prev, 
        status: "in_progress",
        started_at: now
      } : null);

      await conversation.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        connectionType: "webrtc",
      });

      // Start recording automatically
      startRecording();

      // Send context to the agent after session starts
      const context = buildInterviewContext();
      if (context) {
        console.log("Sending interview context to agent:", context);
        // Small delay to ensure connection is stable
        setTimeout(() => {
          try {
            conversation.sendContextualUpdate(context);
            console.log("Context sent successfully");
          } catch (e) {
            console.log("Could not send contextual update:", e);
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error("Failed to start interview:", error);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: error.message || "Could not start the interview. Please try again.",
      });
      setShowPreInterview(true);
    } finally {
      setIsConnecting(false);
    }
  }, [conversation, id, toast, candidateNotes, buildInterviewContext]);

  const confirmEndInterview = useCallback(() => {
    setShowEndConfirmDialog(true);
  }, []);

  const endInterview = useCallback(async () => {
    intentionalDisconnectRef.current = true;
    setShowEndConfirmDialog(false);
    await conversation.endSession();
    // Now handle the interview end (save recording, generate summary, etc.)
    handleInterviewEndRef.current();
  }, [conversation]);

  const endInterviewFromDisconnect = useCallback(async () => {
    setShowDisconnectDialog(false);
    handleInterviewEndRef.current();
  }, []);

  const sendChatMessage = useCallback(async () => {
    if (!chatMessage.trim() || !conversation || conversation.status !== "connected") {
      return;
    }

    // Validate message content
    const validation = validateMessageContent(chatMessage);
    if (!validation.valid) {
      toast({
        variant: "destructive",
        title: "Invalid Message",
        description: validation.error,
      });
      return;
    }

    const messageText = validation.sanitized!;
    setChatMessage("");
    setIsSendingMessage(true);

    try {
      // Add message to transcript immediately
      setTranscript(prev => [...prev, { role: "user", text: messageText }]);
      
      // Save to database
      await supabase.from("interview_messages").insert({
        interview_id: id,
        role: "user",
        content: messageText,
      });

      // Send to ElevenLabs agent
      conversation.sendUserMessage(messageText);
      
      // Scroll to bottom
      setTimeout(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        variant: "destructive",
        title: "Message Failed",
        description: "Could not send message. Please try again.",
      });
    } finally {
      setIsSendingMessage(false);
    }
  }, [chatMessage, conversation, id, toast]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const handleChatFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please upload a PDF, DOC, DOCX, or TXT file.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "File size must be less than 10MB.",
      });
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${id}/chat-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('interview-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setChatUploadedFile(file.name);

      // Send a message to the AI about the uploaded file
      const uploadMessage = `[Shared document: ${file.name}]`;
      setTranscript(prev => [...prev, { role: "user", text: uploadMessage }]);
      
      await supabase.from("interview_messages").insert({
        interview_id: id,
        role: "user",
        content: uploadMessage,
      });

      // Notify the AI agent about the document
      if (conversation.status === "connected") {
        conversation.sendContextualUpdate(`The candidate has just shared a document: ${file.name}. Please acknowledge that you received it.`);
      }

      toast({
        title: "File Shared",
        description: `${file.name} has been shared with the interviewer.`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "Could not upload the file. Please try again.",
      });
    } finally {
      setIsUploading(false);
      if (chatFileInputRef.current) {
        chatFileInputRef.current.value = '';
      }
    }
  };

  const handleInterviewEnd = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsGeneratingSummary(true);

    // Wait for all pending messages to be saved before generating summary
    console.log("Waiting for", pendingMessagesRef.current.length, "pending messages to save...");
    try {
      await Promise.all(pendingMessagesRef.current);
      console.log("All messages saved successfully");
    } catch (error) {
      console.error("Error saving some messages:", error);
    }
    // Clear the pending messages array
    pendingMessagesRef.current = [];

    // Stop recording and upload
    const recordingPath = await stopRecording();
    if (recordingPath) {
      toast({
        title: "Recording Saved",
        description: "Your interview recording has been saved.",
      });
    }

    stopVideo();

    // Always update the interview status to completed first using security definer function
    try {
      const { error: updateError } = await supabase.rpc('update_interview_status', {
        p_interview_id: id,
        p_status: 'completed'
      });
      
      if (updateError) {
        console.error('Failed to update interview status:', updateError);
        // Fallback: try direct update (will work if RLS allows it)
        await supabase
          .from("interviews")
          .update({ 
            status: "completed",
            completed_at: new Date().toISOString()
          })
          .eq("id", id);
      } else {
        console.log('Interview status updated to completed');
      }
    } catch (error) {
      console.error('Error updating interview status:', error);
    }

    // Then try to generate AI summary with proper authorization
    try {
      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('generate-interview-summary', {
        body: { interviewId: id },
        headers: session ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Summary Generation Failed",
          description: "The interview was saved but we couldn't generate the AI summary. The recruiter will still see your responses.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Summary Generation Failed",
        description: "The interview was saved but we couldn't generate the AI summary.",
      });
    } finally {
      setIsGeneratingSummary(false);
    }

    // Update local state
    setInterview(prev => prev ? { ...prev, status: "completed" } : null);

    toast({
      title: "Interview Complete",
      description: "Thank you for completing the interview! The recruiter will review your responses.",
    });
  }, [id, stopRecording, toast]);

  // Update ref whenever handleInterviewEnd changes
  useEffect(() => {
    handleInterviewEndRef.current = handleInterviewEnd;
  }, [handleInterviewEnd]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isTimeWarning = timeRemaining !== null && timeRemaining <= 300; // 5 minutes warning

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

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  // Pre-interview setup screen
  if (showPreInterview && interview.status !== "completed") {
    return (
      <div className="min-h-screen bg-foreground text-primary-foreground">
        <header className="border-b border-primary-foreground/10">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg gradient-bg flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">InterviewAI</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-12 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Welcome to Your Interview</h1>
              <p className="text-primary-foreground/60">
                Position: <span className="font-medium text-primary-foreground">{interview.job_role}</span>
              </p>
              <div className="flex items-center justify-center gap-2 mt-4 text-primary-foreground/60">
                <Clock className="w-4 h-4" />
                <span>Time limit: {interview.time_limit_minutes || DEFAULT_TIME_LIMIT} minutes</span>
              </div>
            </div>

            {/* Document Upload Section */}
            <div className="bg-primary-foreground/5 rounded-2xl border border-primary-foreground/10 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Upload Documents (Optional)
              </h3>
              <p className="text-sm text-primary-foreground/60 mb-4">
                Upload your resume or job description for better context
              </p>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
              />
              
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full border-primary-foreground/20 hover:bg-primary-foreground/10"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {uploadedFile ? uploadedFile.name : "Choose File"}
              </Button>
              
              {uploadedFile && (
                <p className="text-sm text-accent mt-2">✓ File uploaded successfully</p>
              )}
            </div>

            {/* Notes Section */}
            <div className="bg-primary-foreground/5 rounded-2xl border border-primary-foreground/10 p-6">
              <h3 className="text-lg font-semibold mb-4">Additional Notes</h3>
              <p className="text-sm text-primary-foreground/60 mb-4">
                Paste any additional information you'd like the interviewer to consider (max 5000 characters)
              </p>
              <Textarea
                value={candidateNotes}
                onChange={(e) => setCandidateNotes(e.target.value)}
                placeholder="Paste your resume text, job description, or any notes here..."
                className="min-h-[150px] bg-transparent border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/40"
                maxLength={5000}
              />
              <p className="text-xs text-primary-foreground/40 mt-2">
                {candidateNotes.length}/5000 characters
              </p>
            </div>

            {/* Start Button */}
            <Button
              variant="hero"
              size="lg"
              onClick={startInterview}
              disabled={isConnecting}
              className="w-full rounded-xl h-14 text-lg"
            >
              {isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Phone className="w-5 h-5 mr-2" />
              )}
              Start Interview
            </Button>

            <p className="text-center text-sm text-primary-foreground/40">
              You'll need to allow microphone and camera access
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-foreground text-primary-foreground">
      {/* Header with Timer */}
      <header className="border-b border-primary-foreground/10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-bg flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">InterviewAI</span>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Timer */}
            {timeRemaining !== null && interview.status === "in_progress" && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                isTimeWarning ? "bg-destructive/20 text-destructive" : "bg-primary-foreground/10"
              }`}>
                {isTimeWarning && <AlertTriangle className="w-4 h-4" />}
                <Clock className="w-4 h-4" />
                <span className="font-mono font-bold">{formatTime(timeRemaining)}</span>
              </div>
            )}
            
            <div className="text-right">
              <div className="text-sm font-medium">{interview.job_role}</div>
              <div className="text-xs text-primary-foreground/60 capitalize">
                {interview.status === "in_progress" ? "In Progress" : interview.status}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isGeneratingSummary ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">Generating Interview Summary</h2>
            <p className="text-primary-foreground/60">Please wait while we analyze your interview...</p>
          </div>
        ) : interview.status === "completed" ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-accent" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Interview Completed</h2>
            <p className="text-primary-foreground/60 mb-6 max-w-md">
              Thank you for completing your interview. The recruiter has been notified and will review your responses and AI summary.
            </p>
            {redirectCountdown !== null && redirectCountdown > 0 && (
              <p className="text-sm text-primary-foreground/40">
                Redirecting to dashboard in {redirectCountdown} second{redirectCountdown !== 1 ? 's' : ''}...
              </p>
            )}
          </div>
        ) : (
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

                <div className="absolute bottom-4 left-4 px-3 py-1 rounded-lg bg-foreground/80 backdrop-blur-sm">
                  <span className="text-sm font-medium">
                    Candidate
                  </span>
                </div>

                {/* Recording indicator */}
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/90 backdrop-blur-sm">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-xs font-medium text-white">REC</span>
                  </div>
                )}
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
                    onClick={confirmEndInterview}
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
            <div className="bg-primary-foreground/5 rounded-2xl border border-primary-foreground/10 p-6 flex flex-col">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Live Transcript
              </h3>
              <div className="space-y-4 max-h-[400px] overflow-y-auto flex-1 mb-4">
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
                <div ref={transcriptEndRef} />
              </div>

              {/* Chat Input */}
              {isConnected && (
                <div className="border-t border-primary-foreground/10 pt-4">
                  <p className="text-xs text-primary-foreground/40 mb-2">
                    Having audio issues? Type your response below:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={chatFileInputRef}
                      onChange={handleChatFileUpload}
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => chatFileInputRef.current?.click()}
                      disabled={isUploading}
                      className="shrink-0 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
                      title="Share resume or JD"
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Paperclip className="w-4 h-4" />
                      )}
                    </Button>
                    <Input
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Type your answer..."
                      disabled={isSendingMessage}
                      className="bg-transparent border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/40 flex-1"
                      maxLength={10000}
                    />
                    <Button
                      onClick={sendChatMessage}
                      disabled={!chatMessage.trim() || isSendingMessage}
                      size="icon"
                      className="bg-primary hover:bg-primary/90"
                    >
                      {isSendingMessage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* End Interview Confirmation Dialog */}
      <AlertDialog open={showEndConfirmDialog} onOpenChange={setShowEndConfirmDialog}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>End Interview?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end this interview? This action cannot be undone and your responses will be submitted for review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Interview</AlertDialogCancel>
            <AlertDialogAction onClick={endInterview} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              End Interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect Recovery Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <WifiOff className="w-5 h-5 text-destructive" />
              Connection Lost
            </AlertDialogTitle>
            <AlertDialogDescription>
              The connection to the AI interviewer was unexpectedly interrupted. This can happen due to network issues or temporary service unavailability.
              {reconnectAttempts > 0 && (
                <span className="block mt-2 text-muted-foreground">
                  Reconnect attempts: {reconnectAttempts}/{maxReconnectAttempts}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={endInterviewFromDisconnect}>
              End Interview
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={attemptReconnect} 
              disabled={isReconnecting}
              className="bg-primary text-primary-foreground"
            >
              {isReconnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Reconnecting...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Reconnect
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VoiceInterview;
