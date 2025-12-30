import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCandidateAuth } from "@/hooks/useCandidateAuth";
import { validateMessageContent, validateNotes } from "@/lib/validateInput";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import PageErrorState from "@/components/PageErrorState";
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
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Phone, 
  PhoneOff,
  Loader2, 
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
  WifiOff,
  CheckCircle2,
  XCircle
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
  candidate_name: string | null;
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
  const [micEnabled, setMicEnabled] = useState(true);
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  
  const [showPreInterview, setShowPreInterview] = useState(true);
  const [candidateNotes, setCandidateNotes] = useState("");
  const [hasConfirmedGuidelines, setHasConfirmedGuidelines] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [recordSystemAudio, setRecordSystemAudio] = useState(false);
  const [isCapturingSystemAudio, setIsCapturingSystemAudio] = useState(false);
  
  // Device test states
  const [isTestingDevices, setIsTestingDevices] = useState(false);
  const [deviceTestPassed, setDeviceTestPassed] = useState(false);
  const [cameraWorking, setCameraWorking] = useState<boolean | null>(null);
  const [micWorking, setMicWorking] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [liveMicLevel, setLiveMicLevel] = useState(0);
  const testVideoRef = useRef<HTMLVideoElement>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const liveAnalyserRef = useRef<AnalyserNode | null>(null);
  const liveAnimationFrameRef = useRef<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenshotCountRef = useRef(0);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
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
      // Use RPC function to bypass RLS issues with anonymous users
      const savePromise = new Promise<void>((resolve) => {
        supabase.rpc('insert_interview_message', {
          p_interview_id: id,
          p_role: role,
          p_content: validation.sanitized!,
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
      if (screenshotIntervalRef.current) {
        clearInterval(screenshotIntervalRef.current);
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

  // Note: No auto-redirect after interview completion
  // Candidates should stay on the completion screen since they don't have access to the recruiter dashboard

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

  // Device test functions
  const startDeviceTest = async () => {
    setIsTestingDevices(true);
    setCameraWorking(null);
    setMicWorking(null);
    setMicLevel(0);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      
      testStreamRef.current = stream;
      
      // Set up video preview
      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
        testVideoRef.current.muted = true;
      }
      setCameraWorking(true);
      
      // Set up audio level monitoring
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateMicLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const normalizedLevel = Math.min(100, (average / 128) * 100);
          setMicLevel(normalizedLevel);
          
          if (normalizedLevel > 5) {
            setMicWorking(true);
          }
        }
        animationFrameRef.current = requestAnimationFrame(updateMicLevel);
      };
      
      updateMicLevel();
      
    } catch (error) {
      console.error("Error accessing devices:", error);
      setCameraWorking(false);
      setMicWorking(false);
      toast({
        variant: "destructive",
        title: "Device Error",
        description: "Could not access camera or microphone. Please check permissions.",
      });
    }
  };
  
  const stopDeviceTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach(track => track.stop());
      testStreamRef.current = null;
    }
    
    if (testVideoRef.current) {
      testVideoRef.current.srcObject = null;
    }
    
    setIsTestingDevices(false);
    
    if (cameraWorking && micWorking) {
      setDeviceTestPassed(true);
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
      
      // Set up live audio level monitoring
      liveAudioContextRef.current = new AudioContext();
      const source = liveAudioContextRef.current.createMediaStreamSource(stream);
      liveAnalyserRef.current = liveAudioContextRef.current.createAnalyser();
      liveAnalyserRef.current.fftSize = 256;
      source.connect(liveAnalyserRef.current);
      
      const dataArray = new Uint8Array(liveAnalyserRef.current.frequencyBinCount);
      
      const updateLiveMicLevel = () => {
        if (liveAnalyserRef.current) {
          liveAnalyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const normalizedLevel = Math.min(100, (average / 128) * 100);
          setLiveMicLevel(normalizedLevel);
        }
        liveAnimationFrameRef.current = requestAnimationFrame(updateLiveMicLevel);
      };
      
      updateLiveMicLevel();
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Could not access camera. Please check permissions.",
      });
    }
  };
  
  const stopLiveAudioMonitoring = () => {
    if (liveAnimationFrameRef.current) {
      cancelAnimationFrame(liveAnimationFrameRef.current);
      liveAnimationFrameRef.current = null;
    }
    if (liveAudioContextRef.current) {
      liveAudioContextRef.current.close();
      liveAudioContextRef.current = null;
    }
    setLiveMicLevel(0);
  };

  // Store system audio stream reference for cleanup
  const systemAudioStreamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async (withSystemAudio: boolean = false) => {
    if (!streamRef.current) {
      console.error("No stream available for recording");
      return;
    }

    try {
      recordedChunksRef.current = [];
      
      // Create AudioContext for mixing audio streams
      const audioContext = new AudioContext();
      recordingAudioContextRef.current = audioContext;
      
      // Get mic audio from webcam stream
      const micSource = audioContext.createMediaStreamSource(streamRef.current);
      
      // Create a destination for the mixed audio
      const destination = audioContext.createMediaStreamDestination();
      
      // Create gain nodes for volume control
      const micGain = audioContext.createGain();
      micGain.gain.value = 1.0; // Full volume for mic
      
      // Connect mic through gain to destination
      micSource.connect(micGain);
      micGain.connect(destination);
      
      // Try to capture system audio if requested
      if (withSystemAudio) {
        try {
          // Request display media with audio - this captures system audio
          const systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1, height: 1 }, // Minimal video, we only need audio
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            } as any,
          });
          
          systemAudioStreamRef.current = systemAudioStream;
          
          // Stop the video track immediately - we don't need it
          systemAudioStream.getVideoTracks().forEach(track => track.stop());
          
          const systemAudioTracks = systemAudioStream.getAudioTracks();
          if (systemAudioTracks.length > 0) {
            console.log("System audio captured successfully");
            setIsCapturingSystemAudio(true);
            const systemSource = audioContext.createMediaStreamSource(
              new MediaStream([systemAudioTracks[0]])
            );
            const systemGain = audioContext.createGain();
            systemGain.gain.value = 1.5; // Boost AI audio slightly for clarity
            systemSource.connect(systemGain);
            systemGain.connect(destination);
          }
        } catch (displayError) {
          console.log("Could not capture system audio:", displayError);
          setIsCapturingSystemAudio(false);
          // Continue without system audio
        }
      }
      
      // Create combined stream with video from webcam + mixed audio
      const videoTrack = streamRef.current.getVideoTracks()[0];
      const mixedAudioTrack = destination.stream.getAudioTracks()[0];
      
      const combinedStream = new MediaStream();
      if (videoTrack) {
        combinedStream.addTrack(videoTrack);
      }
      if (mixedAudioTrack) {
        combinedStream.addTrack(mixedAudioTrack);
      }
      combinedStreamRef.current = combinedStream;
      
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';

      // Record the combined stream instead of just webcam stream
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 1000000, // 1 Mbps
        audioBitsPerSecond: 128000, // 128 kbps for better audio quality
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
      screenshotCountRef.current = 0; // Reset screenshot counter
      console.log("Recording started", withSystemAudio ? "with system audio" : "mic only");
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast({
        variant: "destructive",
        title: "Recording Error",
        description: "Could not start recording. Please try again.",
      });
    }
  }, [toast]);

  // Capture screenshot from video and upload to storage
  const captureScreenshot = useCallback(async () => {
    if (!videoRef.current || !id) {
      console.log("No video element or interview ID for screenshot");
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error("Could not get canvas context");
        return;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
      });
      
      if (!blob) {
        console.error("Failed to create screenshot blob");
        return;
      }
      
      screenshotCountRef.current += 1;
      const screenshotNumber = screenshotCountRef.current;
      const fileName = `${id}/screenshot-${screenshotNumber}-${Date.now()}.jpg`;
      
      console.log(`Capturing screenshot ${screenshotNumber}...`);
      
      const { error: uploadError } = await supabase.storage
        .from('interview-documents')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
        });
      
      if (uploadError) {
        console.error("Failed to upload screenshot:", uploadError);
        return;
      }
      
      console.log(`Screenshot ${screenshotNumber} uploaded: ${fileName}`);
    } catch (error) {
      console.error("Error capturing screenshot:", error);
    }
  }, [id]);

  // Start screenshot interval (every 5 minutes)
  const startScreenshotInterval = useCallback(() => {
    // Take initial screenshot when interview starts
    captureScreenshot();
    
    // Then take screenshots every 5 minutes (300000ms)
    screenshotIntervalRef.current = setInterval(() => {
      captureScreenshot();
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log("Screenshot interval started (every 5 minutes)");
  }, [captureScreenshot]);

  // Stop screenshot interval
  const stopScreenshotInterval = useCallback(() => {
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
      console.log("Screenshot interval stopped");
    }
    // Take final screenshot
    captureScreenshot();
  }, [captureScreenshot]);

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

          // Clean up audio context and system audio stream
          if (recordingAudioContextRef.current) {
            recordingAudioContextRef.current.close();
            recordingAudioContextRef.current = null;
          }
          if (systemAudioStreamRef.current) {
            systemAudioStreamRef.current.getTracks().forEach(track => track.stop());
            systemAudioStreamRef.current = null;
          }
          setIsCapturingSystemAudio(false);
          combinedStreamRef.current = null;

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

          // Update interview with recording URL using secure RPC function
          const { error: updateError } = await supabase.rpc('update_interview_recording', {
            p_interview_id: id,
            p_recording_url: fileName
          });

          if (updateError) {
            console.error("Failed to update recording URL:", updateError);
          } else {
            console.log("Recording uploaded and saved:", fileName);
          }
          
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
    stopLiveAudioMonitoring();
    setVideoEnabled(false);
  };

  const toggleVideo = () => {
    if (videoEnabled) {
      stopVideo();
    } else {
      startVideo();
    }
  };

  const toggleMic = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setMicEnabled(!micEnabled);
      
      toast({
        title: micEnabled ? "Microphone Muted" : "Microphone Unmuted",
        description: micEnabled 
          ? "The AI interviewer cannot hear you" 
          : "The AI interviewer can now hear you",
      });
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

      // Use RPC function to update status (handles started_at automatically)
      const { error: statusError } = await supabase.rpc('update_interview_status', {
        p_interview_id: id,
        p_status: 'in_progress'
      });

      if (statusError) {
        console.error("Failed to update interview status:", statusError);
        throw new Error("Could not start interview. Please try again.");
      }

      setInterview(prev => prev ? { 
        ...prev, 
        status: "in_progress",
        started_at: new Date().toISOString()
      } : null);

      await conversation.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        connectionType: "webrtc",
      });

      // Start recording and screenshot capture automatically
      await startRecording(recordSystemAudio);
      startScreenshotInterval();

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
  }, [conversation, id, toast, candidateNotes, buildInterviewContext, startRecording, startScreenshotInterval, recordSystemAudio]);

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
      
      // Save to database using RPC function to bypass RLS issues
      await supabase.rpc('insert_interview_message', {
        p_interview_id: id,
        p_role: "user",
        p_content: messageText,
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

    // Stop screenshot interval and recording
    stopScreenshotInterval();
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
    return <PageLoadingSkeleton variant="form" showFooter />;
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

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  // Pre-interview setup screen
  if (showPreInterview && interview.status !== "completed") {
    return (
      <AppLayout containerClassName="py-12 max-w-2xl pb-24" footer="minimal">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Welcome to Your Interview</h1>
              <p className="text-muted-foreground">
                Position: <span className="font-medium text-foreground">{interview.job_role}</span>
              </p>
              <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Time limit: {interview.time_limit_minutes || DEFAULT_TIME_LIMIT} minutes</span>
              </div>
            </div>

            {/* Before You Begin - Quick Tips */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-accent">
                ✅ Before You Begin – Quick Tips
              </h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>Ensure a stable internet connection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>Choose a quiet, comfortable, and well-lit space</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>Keep your camera and microphone ON during the interview</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>Read each question carefully and answer at your own pace</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>Be yourself—we're interested in your real experience and thinking</span>
                </li>
              </ul>
            </div>

            {/* Please Avoid */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-destructive">
                ❌ Please Avoid
              </h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Refreshing or closing the browser once the interview starts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Switching off your camera or microphone mid-interview</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Using external help or unfair means</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span>Rushing your answers—clarity matters more than speed</span>
                </li>
              </ul>
            </div>

            {/* What to Expect */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
                🌟 What to Expect
              </h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>A conversational AI interview, not a test</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Takes about 15–30 minutes to complete</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Questions tailored to the role you have applied</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>You can complete it at your convenience, in one sitting</span>
                </li>
              </ul>
            </div>

            {/* Encouragement Note */}
            <div className="bg-primary/10 rounded-2xl border border-primary/20 p-6 text-center">
              <p className="text-muted-foreground">
                💡 There are no trick questions. Take a deep breath, stay relaxed, and do your best.
              </p>
            </div>

            {/* Device Test Section */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🎥 Test Your Camera & Microphone
              </h3>
              
              {!isTestingDevices && !deviceTestPassed ? (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Click the button below to verify your camera and microphone are working properly.
                  </p>
                  <Button
                    variant="outline"
                    onClick={startDeviceTest}
                    className="w-full"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Start Device Test
                  </Button>
                </div>
              ) : isTestingDevices ? (
                <div className="space-y-4">
                  {/* Camera Preview */}
                  <div className="relative aspect-video bg-muted/30 rounded-xl overflow-hidden border border-border">
                    <video
                      ref={testVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 rounded-lg bg-background/80 backdrop-blur-sm">
                      {cameraWorking === true ? (
                        <CheckCircle2 className="w-4 h-4 text-accent" />
                      ) : cameraWorking === false ? (
                        <XCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      <span className="text-xs font-medium">Camera</span>
                    </div>
                  </div>
                  
                  {/* Microphone Level */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {micWorking === true ? (
                          <CheckCircle2 className="w-4 h-4 text-accent" />
                        ) : micWorking === false ? (
                          <XCircle className="w-4 h-4 text-destructive" />
                        ) : (
                          <Mic className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">Microphone</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {micWorking ? "Working" : "Speak to test..."}
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent transition-all duration-100 rounded-full"
                        style={{ width: `${micLevel}%` }}
                      />
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    onClick={stopDeviceTest}
                    className="w-full"
                  >
                    {cameraWorking && micWorking ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2 text-accent" />
                        Devices Working - Continue
                      </>
                    ) : (
                      "Stop Test"
                    )}
                  </Button>
                </div>
              ) : deviceTestPassed ? (
                <div className="flex items-center gap-3 p-4 bg-accent/10 rounded-xl border border-accent/20">
                  <CheckCircle2 className="w-6 h-6 text-accent" />
                  <div>
                    <p className="font-medium text-accent">Devices Ready</p>
                    <p className="text-sm text-muted-foreground">
                      Your camera and microphone are working properly.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* System Audio Recording Option */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                🔊 Recording Quality
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                For the best recording quality with both your voice and the AI interviewer's voice, enable system audio recording. This requires sharing your screen (audio only).
              </p>
              <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl">
                <Checkbox
                  id="record-system-audio"
                  checked={recordSystemAudio}
                  onCheckedChange={(checked) => setRecordSystemAudio(checked === true)}
                  className="mt-0.5"
                />
                <label 
                  htmlFor="record-system-audio" 
                  className="text-sm cursor-pointer leading-relaxed"
                >
                  <span className="font-medium">Enable system audio recording</span>
                  <span className="block text-muted-foreground text-xs mt-1">
                    Recommended: Captures both your voice and the AI interviewer clearly
                  </span>
                </label>
              </div>
            </div>

            {/* Confirmation Checkbox */}
            <div className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border">
              <Checkbox
                id="confirm-guidelines"
                checked={hasConfirmedGuidelines}
                onCheckedChange={(checked) => setHasConfirmedGuidelines(checked === true)}
                className="mt-0.5"
              />
              <label 
                htmlFor="confirm-guidelines" 
                className="text-sm text-muted-foreground cursor-pointer leading-relaxed"
              >
                I have read and understood the guidelines above. I confirm that I will keep my camera and microphone on during the interview.
              </label>
            </div>

            {/* Start Button */}
            <Button
              variant="hero"
              size="lg"
              onClick={startInterview}
              disabled={isConnecting || !hasConfirmedGuidelines}
              className="w-full rounded-xl h-14 text-lg"
            >
              {isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Phone className="w-5 h-5 mr-2" />
              )}
              Start Interview
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              You'll need to allow microphone and camera access
            </p>
          </motion.div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      footer="minimal"
      headerRightContent={
        <>
          {/* Timer */}
          {timeRemaining !== null && interview.status === "in_progress" && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isTimeWarning ? "bg-destructive/20 text-destructive" : "bg-muted"
            }`}>
              {isTimeWarning && <AlertTriangle className="w-4 h-4" />}
              <Clock className="w-4 h-4" />
              <span className="font-mono font-bold">{formatTime(timeRemaining)}</span>
            </div>
          )}
          
          <div className="text-right">
            <div className="text-sm font-medium">{interview.job_role}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {interview.status === "in_progress" ? "In Progress" : interview.status}
            </div>
          </div>
        </>
      }
    >
        {isGeneratingSummary ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">Generating Interview Summary</h2>
            <p className="text-muted-foreground">Please wait while we analyze your interview...</p>
          </div>
        ) : interview.status === "completed" ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-accent" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Interview Completed</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Thank you for completing your interview. The recruiter has been notified and will review your responses and AI summary.
            </p>
            <p className="text-sm text-muted-foreground">
              You can safely close this page now.
            </p>
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
                    : "border-border bg-card"
                } transition-all`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full gradient-bg flex items-center justify-center ${
                    isSpeaking ? "animate-pulse" : ""
                  }`}>
                    <Volume2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Raj (AI Interviewer)</h3>
                    <p className="text-sm text-muted-foreground">
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
              <div className="relative aspect-video bg-muted/30 rounded-2xl overflow-hidden border border-border">
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
                    <div className="w-24 h-24 rounded-full bg-background/80 flex items-center justify-center">
                      <User className="w-12 h-12 text-muted-foreground" />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 left-4 px-3 py-1 rounded-lg bg-background/80 backdrop-blur-sm">
                  <span className="text-sm font-medium">
                    {interview.candidate_name || "Candidate"}
                  </span>
                </div>

                {/* Recording indicator */}
                {isRecording && (
                  <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/90 backdrop-blur-sm">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-xs font-medium text-white">REC</span>
                    </div>
                    {/* System Audio Indicator */}
                    {isCapturingSystemAudio && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/90 backdrop-blur-sm">
                        <Volume2 className="w-3 h-3 text-primary-foreground" />
                        <span className="text-xs font-medium text-primary-foreground">AI Audio</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={toggleVideo}
                  className={`rounded-full w-14 h-14 ${!videoEnabled ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}
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

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={toggleMic}
                    disabled={!isConnected}
                    className={`rounded-full w-14 h-14 ${
                      !micEnabled 
                        ? "bg-destructive text-destructive-foreground" 
                        : isConnected 
                          ? "bg-accent text-accent-foreground" 
                          : "bg-muted"
                    }`}
                  >
                    {micEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                  </Button>
                  
                  {/* Live Mic Level Indicator */}
                  {isConnected && micEnabled && (
                    <div className="flex flex-col gap-0.5 h-10">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-1.5 rounded-sm transition-all duration-75 ${
                            liveMicLevel > (4 - i) * 20 
                              ? i === 0 
                                ? "bg-destructive" 
                                : i === 1 
                                  ? "bg-yellow-500" 
                                  : "bg-accent"
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Transcript Panel */}
            <div className="bg-card rounded-2xl border border-border p-6 flex flex-col">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Live Transcript
              </h3>
              <div className="space-y-4 max-h-[400px] overflow-y-auto flex-1 mb-4">
                {transcript.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
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
                            ? "bg-primary/10 ml-4"
                            : "bg-muted mr-4"
                        }`}
                      >
                        <p className="text-xs text-muted-foreground mb-1">
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
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground mb-2">
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
                      className="shrink-0"
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
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground flex-1"
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
    </AppLayout>
  );
};

export default VoiceInterview;
