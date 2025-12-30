import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { jsPDF } from "jspdf";
import BulkInviteDialog from "@/components/BulkInviteDialog";
import JobsTab from "@/components/JobsTab";
import ApplicationsTab from "@/components/ApplicationsTab";
import WhatsAppStatusBadge from "@/components/WhatsAppStatusBadge";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import OnboardingTour from "@/components/OnboardingTour";
import OnboardingProgress from "@/components/OnboardingProgress";
import InterviewScreenshotsGallery from "@/components/InterviewScreenshotsGallery";
import CandidateFormFields from "@/components/CandidateFormFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  LogOut,
  Users,
  Clock,
  TrendingUp,
  Play,
  Copy,
  ExternalLink,
  Trash2,
  FileText,
  MessageSquare,
  Star,
  CheckCircle,
  XCircle,
  HelpCircle,
  Video,
  Settings,
  Eye,
  Briefcase,
  Mail,
  RefreshCw,
  Share2,
  Download,
  FileDown,
  Send,
  Link,
  Loader2,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
interface Interview {
  id: string;
  candidate_email: string;
  candidate_name: string | null;
  job_role: string;
  status: string;
  score: number | null;
  created_at: string;
  completed_at: string | null;
  transcript_summary: string | null;
  candidate_resume_url: string | null;
  candidate_notes: string | null;
  time_limit_minutes: number | null;
  recording_url: string | null;
}

interface InterviewSummary {
  overallScore: number;
  summary: string;
  strengths: string[];
  areasForImprovement: string[];
  keyTakeaways: string[];
  recommendation: string;
  communicationScore: number;
  technicalScore: number;
  cultureFitScore: number;
}

interface RecruiterProfile {
  company_name: string | null;
  brand_color: string;
  logo_url: string | null;
  email_intro: string | null;
  email_tips: string | null;
  email_cta_text: string | null;
}

// Helper function to adjust color brightness
const adjustColor = (color: string, amount: number): string => {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

// Helper function to format time in seconds to MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [transcriptMessages, setTranscriptMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [newInterview, setNewInterview] = useState({
    email: "",
    name: "",
    phone: ""
  });
  const [creating, setCreating] = useState(false);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [resendingWhatsApp, setResendingWhatsApp] = useState<string | null>(null);
  const [regeneratingSummary, setRegeneratingSummary] = useState<string | null>(null);
  const [emailShareDialogOpen, setEmailShareDialogOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);
  const [videoShareDialogOpen, setVideoShareDialogOpen] = useState(false);
  const [videoShareEmail, setVideoShareEmail] = useState("");
  const [sendingVideoEmail, setSendingVideoEmail] = useState(false);
  const [videoTranscription, setVideoTranscription] = useState<string | null>(null);
  const [videoTranscriptionDetailed, setVideoTranscriptionDetailed] = useState<Array<{
    speaker: string;
    text: string;
    startTime: number;
    endTime: number;
  }>>([]);
  const [transcribingVideo, setTranscribingVideo] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [showTranscriptComparison, setShowTranscriptComparison] = useState(false);
  const [profile, setProfile] = useState<RecruiterProfile>({
    company_name: null,
    brand_color: '#6366f1',
    logo_url: null,
    email_intro: null,
    email_tips: null,
    email_cta_text: null
  });
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [jobsCount, setJobsCount] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Get interview IDs for WhatsApp status tracking
  const interviewIds = useMemo(() => interviews.map(i => i.id), [interviews]);
  const { whatsappMessages } = useWhatsAppStatus(interviewIds);

  useEffect(() => {
    const checkUserRole = async (userId: string) => {
      // Check if user is admin
      const { data: adminData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(adminData !== null);
      
      // Check if user is a candidate - redirect them to candidate dashboard
      const { data: roleData } = await supabase.rpc('get_user_role', { _user_id: userId });
      if (roleData === 'candidate') {
        navigate("/candidate/dashboard");
        return false; // Indicate user should not stay on this page
      }
      return true; // User can stay
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/auth");
        } else {
          setTimeout(() => checkUserRole(session.user.id), 0);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        const canStay = await checkUserRole(session.user.id);
        if (canStay) {
          fetchInterviews();
          fetchProfile(session.user.id);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Real-time subscription for interview updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('interviews-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interviews'
        },
        (payload) => {
          console.log('Interview updated:', payload);
          // Refetch interviews when any change occurs
          fetchInterviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch jobs count for onboarding progress
  useEffect(() => {
    if (!user) return;
    
    const fetchJobsCount = async () => {
      const { count } = await supabase
        .from("jobs")
        .select("*", { count: "exact", head: true });
      setJobsCount(count || 0);
    };
    
    fetchJobsCount();
    
    // Subscribe to jobs changes
    const channel = supabase
      .channel('jobs-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs'
        },
        () => fetchJobsCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Helper to get fresh access token for edge function calls
  const getFreshAccessToken = async (): Promise<string | null> => {
    try {
      // First try to get current session
      let { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        // Session expired, try to refresh
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          toast({
            variant: "destructive",
            title: "Session Expired",
            description: "Please log in again to continue."
          });
          navigate("/auth");
          return null;
        }
        session = refreshData.session;
      }
      
      return session.access_token;
    } catch (e) {
      console.error("Session error:", e);
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "Please log in again."
      });
      navigate("/auth");
      return null;
    }
  };

  const fetchInterviews = async () => {
    try {
      const { data, error } = await supabase
        .from("interviews")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInterviews((data as Interview[]) || []);
    } catch (error: any) {
      console.error("Error fetching interviews:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load interviews"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("company_name, brand_color, logo_url, email_intro, email_tips, email_cta_text")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setProfile({
          company_name: data.company_name,
          brand_color: data.brand_color || '#6366f1',
          logo_url: data.logo_url,
          email_intro: data.email_intro,
          email_tips: data.email_tips,
          email_cta_text: data.email_cta_text
        });
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    }
  };


  const fetchTranscript = async (interviewId: string) => {
    try {
      const { data, error } = await supabase
        .from("interview_messages")
        .select("*")
        .eq("interview_id", interviewId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setTranscriptMessages(data || []);
    } catch (error) {
      console.error("Error fetching transcript:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleCreateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

    try {
      const { data, error } = await supabase
        .from("interviews")
        .insert({
          recruiter_id: user.id,
          candidate_email: newInterview.email,
          candidate_name: newInterview.name || null,
          job_role: "General Interview",
          status: "pending",
          time_limit_minutes: 30
        })
        .select()
        .single();

      if (error) throw error;

      // Get fresh access token before calling edge function
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        setCreating(false);
        return;
      }

      // Send invitation email to candidate
      const interviewUrl = `${window.location.origin}/voice-interview/${data.id}`;
      
      try {
        const { data: emailData, error: emailError } = await supabase.functions.invoke("send-candidate-invite", {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          body: {
            candidateEmail: newInterview.email,
            candidateName: newInterview.name || null,
            jobRole: "General Interview",
            interviewId: data.id,
            interviewUrl,
            recruiterId: user.id,
            candidatePhone: newInterview.phone
          }
        });

        if (emailError) {
          console.error("Failed to send invitation email:", emailError);
          // Check for auth errors
          if (emailError.message?.includes('401') || emailError.message?.includes('JWT')) {
            toast({
              variant: "destructive",
              title: "Session Expired",
              description: "Please refresh the page and try again."
            });
          } else {
            toast({
              title: "Interview Created",
              description: "Interview created but email notification failed. Share the link manually."
            });
          }
        } else {
          toast({
            title: "Interview Created & Email Sent",
            description: `Invitation email sent to ${newInterview.email}`
          });
        }
      } catch (emailErr: any) {
        console.error("Email sending error:", emailErr);
        if (emailErr?.message?.includes('401') || emailErr?.message?.includes('JWT')) {
          toast({
            variant: "destructive",
            title: "Session Expired",
            description: "Please refresh the page and try again."
          });
        } else {
          toast({
            title: "Interview Created",
            description: "Interview created but email notification failed. Share the link manually."
          });
        }
      }

      setInterviews([data as Interview, ...interviews]);
      setCreateDialogOpen(false);
      setNewInterview({ email: "", name: "", phone: "" });
    } catch (error: any) {
      console.error("Error creating interview:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create interview"
      });
    } finally {
      setCreating(false);
    }
  };

  const copyInterviewLink = (id: string) => {
    const url = `${window.location.origin}/voice-interview/${id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Interview link copied to clipboard"
    });
  };

  const resendInviteEmail = async (interview: Interview) => {
    setResendingEmail(interview.id);
    
    // Get fresh access token before calling edge function
    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      setResendingEmail(null);
      return;
    }
    
    const interviewUrl = `${window.location.origin}/voice-interview/${interview.id}`;
    
    try {
      const { error } = await supabase.functions.invoke("send-candidate-invite", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: {
          candidateEmail: interview.candidate_email,
          candidateName: interview.candidate_name,
          jobRole: interview.job_role,
          interviewId: interview.id,
          interviewUrl,
          recruiterId: user?.id
        }
      });

      if (error) {
        if (error.message?.includes('401') || error.message?.includes('JWT')) {
          throw new Error("Session expired");
        }
        throw error;
      }

      toast({
        title: "Email Sent",
        description: `Invitation resent to ${interview.candidate_email}`
      });
    } catch (error: any) {
      console.error("Failed to resend invite:", error);
      if (error?.message?.includes('Session expired') || error?.message?.includes('401')) {
        toast({
          variant: "destructive",
          title: "Session Expired",
          description: "Please refresh the page and try again."
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Send",
          description: "Could not resend invitation email. Please try again."
        });
      }
    } finally {
      setResendingEmail(null);
    }
  };

  const resendWhatsAppInvite = async (interview: Interview) => {
    // Get the phone number from whatsappMessages
    const whatsappMessage = whatsappMessages[interview.id];
    if (!whatsappMessage?.candidate_phone) {
      toast({
        variant: "destructive",
        title: "No Phone Number",
        description: "This candidate doesn't have a phone number on record."
      });
      return;
    }

    setResendingWhatsApp(interview.id);
    
    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      setResendingWhatsApp(null);
      return;
    }
    
    const interviewUrl = `${window.location.origin}/voice-interview/${interview.id}`;
    
    try {
      const { error } = await supabase.functions.invoke("send-whatsapp-invite", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: {
          candidatePhone: whatsappMessage.candidate_phone,
          candidateName: interview.candidate_name,
          jobRole: interview.job_role,
          interviewId: interview.id,
          interviewUrl,
          companyName: profile.company_name
        }
      });

      if (error) {
        if (error.message?.includes('401') || error.message?.includes('JWT')) {
          throw new Error("Session expired");
        }
        throw error;
      }

      toast({
        title: "WhatsApp Sent",
        description: `Invitation resent to ${whatsappMessage.candidate_phone}`
      });
    } catch (error: any) {
      console.error("Failed to resend WhatsApp:", error);
      if (error?.message?.includes('Session expired') || error?.message?.includes('401')) {
        toast({
          variant: "destructive",
          title: "Session Expired",
          description: "Please refresh the page and try again."
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Send",
          description: "Could not resend WhatsApp invitation. Please try again."
        });
      }
    } finally {
      setResendingWhatsApp(null);
    }
  };

  const regenerateSummary = async (interview: Interview) => {
    setRegeneratingSummary(interview.id);
    
    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      setRegeneratingSummary(null);
      return;
    }
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-interview-summary", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: {
          interviewId: interview.id
        }
      });

      if (error) {
        if (error.message?.includes('401') || error.message?.includes('JWT')) {
          throw new Error("Session expired");
        }
        throw error;
      }

      toast({
        title: "Summary Generated",
        description: `AI summary has been generated for ${interview.candidate_name || interview.candidate_email}`
      });

      // Refresh interviews to show the new summary
      fetchInterviews();
    } catch (error: any) {
      console.error("Failed to regenerate summary:", error);
      if (error?.message?.includes('Session expired') || error?.message?.includes('401')) {
        toast({
          variant: "destructive",
          title: "Session Expired",
          description: "Please refresh the page and try again."
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Generate",
          description: "Could not generate AI summary. Please try again."
        });
      }
    } finally {
      setRegeneratingSummary(null);
    }
  };

  const handleBulkInvite = async (candidates: { email: string; name: string; jobRole: string }[]) => {
    if (!user) return [];

    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      return candidates.map(c => ({ email: c.email, success: false, error: "Session expired" }));
    }

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const candidate of candidates) {
      try {
        // Create interview
        const { data, error } = await supabase
          .from("interviews")
          .insert({
            recruiter_id: user.id,
            candidate_email: candidate.email,
            candidate_name: candidate.name || null,
            job_role: candidate.jobRole,
            status: "pending",
            time_limit_minutes: 30
          })
          .select()
          .single();

        if (error) throw error;

        // Send invitation email
        const interviewUrl = `${window.location.origin}/voice-interview/${data.id}`;
        
        const { error: emailError } = await supabase.functions.invoke("send-candidate-invite", {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            candidateEmail: candidate.email,
            candidateName: candidate.name || null,
            jobRole: candidate.jobRole,
            interviewId: data.id,
            interviewUrl,
            recruiterId: user.id
          }
        });

        if (emailError) {
          console.warn(`Email failed for ${candidate.email}:`, emailError);
        }

        setInterviews(prev => [data as Interview, ...prev]);
        results.push({ email: candidate.email, success: true });
      } catch (error: any) {
        console.error(`Error for ${candidate.email}:`, error);
        results.push({ email: candidate.email, success: false, error: error.message || "Failed" });
      }
    }

    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      toast({
        title: "Bulk Invites Sent",
        description: `Successfully sent ${successCount} of ${candidates.length} invitations.`
      });
    }

    return results;
  };

  const deleteInterview = async (id: string) => {
    try {
      const { error } = await supabase
        .from("interviews")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setInterviews(interviews.filter(i => i.id !== id));
      toast({ title: "Interview deleted" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete interview"
      });
    }
  };

  const openSummary = async (interview: Interview) => {
    setSelectedInterview(interview);
    setSummaryDialogOpen(true);
    setRecordingUrl(null);
    setVideoTranscription(null);
    setVideoTranscriptionDetailed([]);
    setVideoCurrentTime(0);
    setShowTranscriptComparison(false);
    await fetchTranscript(interview.id);
    
    // Load recording URL if available
    if (interview.recording_url) {
      setLoadingRecording(true);
      try {
        const { data, error } = await supabase.storage
          .from('interview-documents')
          .createSignedUrl(interview.recording_url, 60 * 60 * 24); // 24 hour expiry
        
        if (!error && data?.signedUrl) {
          setRecordingUrl(data.signedUrl);
        }
      } catch (err) {
        console.error("Failed to load recording:", err);
      } finally {
        setLoadingRecording(false);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-accent/20 text-accent";
      case "in_progress": return "bg-primary/20 text-primary";
      case "pending": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const parseSummary = (summaryJson: string | null): InterviewSummary | null => {
    if (!summaryJson) return null;
    try {
      // First try direct parse
      return JSON.parse(summaryJson);
    } catch {
      try {
        // Try to extract JSON from markdown code blocks
        let cleaned = summaryJson.trim();
        if (cleaned.startsWith('```json')) {
          cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
          cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
          cleaned = cleaned.slice(0, -3);
        }
        return JSON.parse(cleaned.trim());
      } catch {
        return null;
      }
    }
  };

  const getRecommendationIcon = (recommendation: string) => {
    const lower = recommendation.toLowerCase();
    if (lower.includes("hire") && !lower.includes("not")) {
      return <CheckCircle className="w-5 h-5 text-accent" />;
    } else if (lower.includes("pass") || lower.includes("not")) {
      return <XCircle className="w-5 h-5 text-destructive" />;
    }
    return <HelpCircle className="w-5 h-5 text-warning" />;
  };

  const stats = {
    total: interviews.length,
    completed: interviews.filter(i => i.status === "completed").length,
    pending: interviews.filter(i => i.status === "pending").length,
    avgScore: interviews.filter(i => i.score).reduce((acc, i) => acc + (i.score || 0), 0) / 
              (interviews.filter(i => i.score).length || 1)
  };

  if (loading) {
    return <PageLoadingSkeleton variant="dashboard" showFooter />;
  }

  const selectedSummary = selectedInterview ? parseSummary(selectedInterview.transcript_summary) : null;

  return (
    <AppLayout
      footer="minimal"
      isAdmin={isAdmin}
      headerRightContent={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} title="Settings" data-tour="settings">
            <Settings className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground hidden sm:block">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </>
      }
    >
        {/* Onboarding Tour */}
        <OnboardingTour isFirstVisit={!loading} />

        {/* Onboarding Progress Tracker */}
        <OnboardingProgress
          hasJobs={jobsCount > 0}
          hasCandidates={interviews.length > 0}
          hasCompletedInterview={interviews.some(i => i.status === "completed")}
          hasBrandingSetup={!!(profile.logo_url || profile.company_name)}
          onCreateJob={() => {
            // Switch to jobs tab - we'll use a ref or state
            const jobsTab = document.querySelector('[value="jobs"]') as HTMLButtonElement;
            if (jobsTab) jobsTab.click();
            // Small delay then trigger create job dialog via clicking the button
            setTimeout(() => {
              const createBtn = document.querySelector('[data-tour="create-job"]') as HTMLButtonElement;
              if (createBtn) createBtn.click();
            }, 100);
          }}
          onOpenSettings={() => navigate("/settings")}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-tour="stats">
          {[
            { label: "Total Interviews", value: stats.total, icon: Users },
            { label: "Completed", value: stats.completed, icon: TrendingUp },
            { label: "Pending", value: stats.pending, icon: Clock },
            { label: "Avg Score", value: stats.avgScore.toFixed(1), icon: Play },
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 rounded-xl bg-card border border-border"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs for Jobs and Interviews */}
        <Tabs defaultValue="jobs" className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3" data-tour="tabs">
            <TabsTrigger value="jobs" className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              Jobs
            </TabsTrigger>
            <TabsTrigger value="applications" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Applications
            </TabsTrigger>
            <TabsTrigger value="interviews" className="flex items-center gap-2" data-tour="interviews-tab">
              <Users className="w-4 h-4" />
              Interviews
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jobs">
            <JobsTab user={user} />
          </TabsContent>

          <TabsContent value="applications">
            <ApplicationsTab user={user} />
          </TabsContent>

          <TabsContent value="interviews">
            {/* Interviews List */}
            <div className="bg-card rounded-2xl border border-border">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">All Interviews</h2>
                  <p className="text-sm text-muted-foreground">Manage your candidate interviews</p>
                </div>
              </div>
          <BulkInviteDialog
            open={bulkInviteOpen}
            onOpenChange={setBulkInviteOpen}
            onSubmit={handleBulkInvite}
          />

          {interviews.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No interviews yet</h3>
              <p className="text-muted-foreground mb-4">Create your first interview to get started</p>
              <Button variant="hero" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Interview
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="p-4 hover:bg-secondary/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-semibold">
                      {(interview.candidate_name || interview.candidate_email)
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        {interview.candidate_name || interview.candidate_email}
                      </div>
                      <div className="text-sm text-muted-foreground">{interview.job_role}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {interview.score !== null && (
                      <div className="text-right">
                        <div className="font-semibold text-foreground">{interview.score}/10</div>
                        <div className="text-xs text-muted-foreground">Score</div>
                      </div>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(interview.status)}`}>
                      {interview.status.replace("_", " ")}
                    </span>
                    {whatsappMessages[interview.id] && (
                      <div data-tour="whatsapp-status">
                        <WhatsAppStatusBadge
                          status={whatsappMessages[interview.id].status}
                          phone={whatsappMessages[interview.id].candidate_phone}
                          sentAt={whatsappMessages[interview.id].sent_at}
                          deliveredAt={whatsappMessages[interview.id].delivered_at || undefined}
                          readAt={whatsappMessages[interview.id].read_at || undefined}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      {interview.status === "completed" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openSummary(interview)}
                            title="View Summary"
                          >
                            <FileText className="w-4 h-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              if (interview.recording_url) {
                                // Get signed URL for the recording
                                const { data, error } = await supabase.storage
                                  .from('interview-documents')
                                  .createSignedUrl(interview.recording_url, 60 * 60); // 1 hour expiry
                                
                                if (error || !data?.signedUrl) {
                                  toast({
                                    variant: "destructive",
                                    title: "Error",
                                    description: "Could not access recording. It may have expired.",
                                  });
                                  return;
                                }
                                window.open(data.signedUrl, "_blank");
                              } else {
                                toast({
                                  title: "No Recording",
                                  description: "This interview was completed before recording was available.",
                                });
                              }
                            }}
                            title={interview.recording_url ? "Watch Recording" : "No recording available"}
                            className={!interview.recording_url ? "opacity-50" : ""}
                          >
                            <Video className={`w-4 h-4 ${interview.recording_url ? "text-accent" : "text-muted-foreground"}`} />
                          </Button>
                          {!interview.transcript_summary && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => regenerateSummary(interview)}
                              disabled={regeneratingSummary === interview.id}
                              title="Regenerate AI Summary"
                            >
                              <RefreshCw className={`w-4 h-4 text-amber-500 ${regeneratingSummary === interview.id ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                        </>
                      )}
                      {interview.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => resendInviteEmail(interview)}
                            disabled={resendingEmail === interview.id}
                            title="Resend invite email"
                          >
                            <Mail className={`w-4 h-4 ${resendingEmail === interview.id ? "animate-pulse" : ""}`} />
                          </Button>
                          {whatsappMessages[interview.id] && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => resendWhatsAppInvite(interview)}
                              disabled={resendingWhatsApp === interview.id}
                              title="Resend WhatsApp invite"
                            >
                              <MessageSquare className={`w-4 h-4 text-green-500 ${resendingWhatsApp === interview.id ? "animate-pulse" : ""}`} />
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyInterviewLink(interview.id)}
                        title="Copy link"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(`/voice-interview/${interview.id}`, "_blank")}
                        title="Open voice interview"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteInterview(interview.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
            </div>
          </TabsContent>
        </Tabs>

      {/* Summary Dialog */}
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Interview Summary
              </DialogTitle>
              {selectedInterview && selectedSummary && (
                <div className="flex items-center gap-2 mr-6">
                  {/* Share Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Share2 className="w-4 h-4" />
                        Share
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          const summaryText = `Interview Summary - ${selectedInterview.candidate_name || selectedInterview.candidate_email}
Role: ${selectedInterview.job_role}
Overall Score: ${selectedInterview.score || 'N/A'}/10

AI Summary:
${selectedSummary.summary}

Recommendation: ${selectedSummary.recommendation}

Scores:
- Communication: ${selectedSummary.communicationScore}/10
- Technical: ${selectedSummary.technicalScore}/10
- Culture Fit: ${selectedSummary.cultureFitScore}/10

Strengths:
${selectedSummary.strengths.map(s => `• ${s}`).join('\n')}

Areas for Improvement:
${selectedSummary.areasForImprovement.map(a => `• ${a}`).join('\n')}

Key Takeaways:
${selectedSummary.keyTakeaways.map(t => `• ${t}`).join('\n')}`;

                          navigator.clipboard.writeText(summaryText);
                          toast({
                            title: "Copied to Clipboard",
                            description: "Interview summary has been copied to your clipboard.",
                          });
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy to Clipboard
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEmailShareDialogOpen(true)}>
                        <Mail className="w-4 h-4 mr-2" />
                        Send via Email
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Download Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          // Generate PDF
                          const doc = new jsPDF();
                          const candidateName = selectedInterview.candidate_name || selectedInterview.candidate_email;
                          const pageWidth = doc.internal.pageSize.getWidth();
                          let yPos = 20;
                          const margin = 20;
                          const contentWidth = pageWidth - 2 * margin;

                          // Header
                          doc.setFillColor(139, 92, 246);
                          doc.rect(0, 0, pageWidth, 40, 'F');
                          doc.setTextColor(255, 255, 255);
                          doc.setFontSize(22);
                          doc.setFont("helvetica", "bold");
                          doc.text("Interview Summary", pageWidth / 2, 25, { align: "center" });
                          doc.setFontSize(10);
                          doc.setFont("helvetica", "normal");
                          doc.text(profile.company_name || "VantaHire", pageWidth / 2, 34, { align: "center" });

                          yPos = 55;

                          // Candidate Info
                          doc.setTextColor(31, 41, 55);
                          doc.setFontSize(16);
                          doc.setFont("helvetica", "bold");
                          doc.text(candidateName, margin, yPos);
                          yPos += 7;
                          doc.setFontSize(11);
                          doc.setFont("helvetica", "normal");
                          doc.setTextColor(107, 114, 128);
                          doc.text(selectedInterview.job_role, margin, yPos);

                          // Score
                          if (selectedInterview.score) {
                            doc.setTextColor(139, 92, 246);
                            doc.setFontSize(24);
                            doc.setFont("helvetica", "bold");
                            doc.text(`${selectedInterview.score}/10`, pageWidth - margin, yPos - 5, { align: "right" });
                            doc.setFontSize(9);
                            doc.setFont("helvetica", "normal");
                            doc.text("Overall Score", pageWidth - margin, yPos + 2, { align: "right" });
                          }

                          yPos += 15;

                          // AI Summary Section
                          doc.setFillColor(250, 245, 255);
                          doc.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'F');
                          yPos += 10;
                          doc.setTextColor(139, 92, 246);
                          doc.setFontSize(12);
                          doc.setFont("helvetica", "bold");
                          doc.text("AI Summary", margin + 5, yPos);
                          yPos += 7;
                          doc.setTextColor(75, 85, 99);
                          doc.setFontSize(10);
                          doc.setFont("helvetica", "normal");
                          const summaryLines = doc.splitTextToSize(selectedSummary.summary, contentWidth - 10);
                          doc.text(summaryLines.slice(0, 3), margin + 5, yPos);
                          yPos += 28;

                          // Recommendation
                          doc.setFillColor(248, 248, 252);
                          doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, 'F');
                          yPos += 10;
                          doc.setTextColor(31, 41, 55);
                          doc.setFontSize(12);
                          doc.setFont("helvetica", "bold");
                          doc.text("Recommendation", margin + 5, yPos);
                          yPos += 7;
                          doc.setTextColor(75, 85, 99);
                          doc.setFontSize(10);
                          doc.setFont("helvetica", "normal");
                          const recLines = doc.splitTextToSize(selectedSummary.recommendation, contentWidth - 10);
                          doc.text(recLines.slice(0, 2), margin + 5, yPos);
                          yPos += 18;

                          // Scores
                          doc.setTextColor(31, 41, 55);
                          doc.setFontSize(12);
                          doc.setFont("helvetica", "bold");
                          doc.text("Detailed Scores", margin, yPos);
                          yPos += 10;

                          const scoreWidth = (contentWidth - 10) / 3;
                          const scores = [
                            { label: "Communication", score: selectedSummary.communicationScore },
                            { label: "Technical", score: selectedSummary.technicalScore },
                            { label: "Culture Fit", score: selectedSummary.cultureFitScore },
                          ];

                          scores.forEach((item, idx) => {
                            const xPos = margin + idx * (scoreWidth + 5);
                            doc.setFillColor(248, 248, 252);
                            doc.roundedRect(xPos, yPos, scoreWidth, 25, 3, 3, 'F');
                            doc.setTextColor(31, 41, 55);
                            doc.setFontSize(16);
                            doc.setFont("helvetica", "bold");
                            doc.text(`${item.score}/10`, xPos + scoreWidth / 2, yPos + 12, { align: "center" });
                            doc.setFontSize(8);
                            doc.setFont("helvetica", "normal");
                            doc.setTextColor(107, 114, 128);
                            doc.text(item.label, xPos + scoreWidth / 2, yPos + 20, { align: "center" });
                          });

                          yPos += 35;

                          // Strengths
                          doc.setFillColor(240, 253, 244);
                          doc.roundedRect(margin, yPos, contentWidth / 2 - 5, 45, 3, 3, 'F');
                          doc.setTextColor(22, 101, 52);
                          doc.setFontSize(11);
                          doc.setFont("helvetica", "bold");
                          doc.text("Strengths", margin + 5, yPos + 10);
                          doc.setTextColor(75, 85, 99);
                          doc.setFontSize(9);
                          doc.setFont("helvetica", "normal");
                          selectedSummary.strengths.slice(0, 3).forEach((s, i) => {
                            const lines = doc.splitTextToSize(`• ${s}`, contentWidth / 2 - 15);
                            doc.text(lines[0], margin + 5, yPos + 18 + i * 8);
                          });

                          // Areas for Improvement
                          const impX = margin + contentWidth / 2 + 5;
                          doc.setFillColor(255, 251, 235);
                          doc.roundedRect(impX, yPos, contentWidth / 2 - 5, 45, 3, 3, 'F');
                          doc.setTextColor(146, 64, 14);
                          doc.setFontSize(11);
                          doc.setFont("helvetica", "bold");
                          doc.text("Areas for Improvement", impX + 5, yPos + 10);
                          doc.setTextColor(75, 85, 99);
                          doc.setFontSize(9);
                          doc.setFont("helvetica", "normal");
                          selectedSummary.areasForImprovement.slice(0, 3).forEach((a, i) => {
                            const lines = doc.splitTextToSize(`• ${a}`, contentWidth / 2 - 15);
                            doc.text(lines[0], impX + 5, yPos + 18 + i * 8);
                          });

                          yPos += 55;

                          // Key Takeaways
                          doc.setFillColor(248, 248, 252);
                          doc.roundedRect(margin, yPos, contentWidth, 40, 3, 3, 'F');
                          doc.setTextColor(31, 41, 55);
                          doc.setFontSize(11);
                          doc.setFont("helvetica", "bold");
                          doc.text("Key Takeaways", margin + 5, yPos + 10);
                          doc.setTextColor(75, 85, 99);
                          doc.setFontSize(9);
                          doc.setFont("helvetica", "normal");
                          selectedSummary.keyTakeaways.slice(0, 3).forEach((t, i) => {
                            const lines = doc.splitTextToSize(`• ${t}`, contentWidth - 15);
                            doc.text(lines[0], margin + 5, yPos + 18 + i * 8);
                          });

                          // Footer
                          doc.setTextColor(156, 163, 175);
                          doc.setFontSize(8);
                          doc.text(`Generated by VantaHire on ${new Date().toLocaleDateString()}`, pageWidth / 2, 285, { align: "center" });

                          doc.save(`interview-summary-${candidateName.replace(/\s+/g, '-').toLowerCase()}.pdf`);

                          toast({
                            title: "PDF Downloaded",
                            description: "Interview summary has been downloaded as PDF.",
                          });
                        }}
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Download as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const summaryText = `Interview Summary - ${selectedInterview.candidate_name || selectedInterview.candidate_email}
================================================================================
Role: ${selectedInterview.job_role}
Date: ${selectedInterview.completed_at ? new Date(selectedInterview.completed_at).toLocaleDateString() : 'N/A'}
Overall Score: ${selectedInterview.score || 'N/A'}/10

--------------------------------------------------------------------------------
AI SUMMARY
--------------------------------------------------------------------------------
${selectedSummary.summary}

--------------------------------------------------------------------------------
RECOMMENDATION
--------------------------------------------------------------------------------
${selectedSummary.recommendation}

--------------------------------------------------------------------------------
DETAILED SCORES
--------------------------------------------------------------------------------
Communication: ${selectedSummary.communicationScore}/10
Technical: ${selectedSummary.technicalScore}/10
Culture Fit: ${selectedSummary.cultureFitScore}/10

--------------------------------------------------------------------------------
STRENGTHS
--------------------------------------------------------------------------------
${selectedSummary.strengths.map(s => `• ${s}`).join('\n')}

--------------------------------------------------------------------------------
AREAS FOR IMPROVEMENT
--------------------------------------------------------------------------------
${selectedSummary.areasForImprovement.map(a => `• ${a}`).join('\n')}

--------------------------------------------------------------------------------
KEY TAKEAWAYS
--------------------------------------------------------------------------------
${selectedSummary.keyTakeaways.map(t => `• ${t}`).join('\n')}

================================================================================
Generated by VantaHire
`;

                          const blob = new Blob([summaryText], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `interview-summary-${(selectedInterview.candidate_name || selectedInterview.candidate_email).replace(/\s+/g, '-').toLowerCase()}.txt`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);

                          toast({
                            title: "Downloaded",
                            description: "Interview summary has been downloaded as text file.",
                          });
                        }}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Download as Text
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </DialogHeader>
          
          {selectedInterview && (
            <div className="space-y-6 mt-4">
              {/* Candidate Info */}
              <div className="flex items-center gap-4 p-4 bg-secondary/50 rounded-xl">
                <div className="w-12 h-12 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-semibold text-lg">
                  {(selectedInterview.candidate_name || selectedInterview.candidate_email)
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    {selectedInterview.candidate_name || selectedInterview.candidate_email}
                  </div>
                  <div className="text-sm text-muted-foreground">{selectedInterview.job_role}</div>
                </div>
                {selectedInterview.score && (
                  <div className="ml-auto text-right">
                    <div className="text-2xl font-bold text-primary">{selectedInterview.score}/10</div>
                    <div className="text-xs text-muted-foreground">Overall Score</div>
                  </div>
                )}
              </div>

              {selectedSummary ? (
                <>
                  {/* AI Summary */}
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <h4 className="font-semibold text-foreground mb-2">AI Summary</h4>
                    <p className="text-muted-foreground">{selectedSummary.summary}</p>
                  </div>

                  {/* Recommendation */}
                  <div className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border">
                    {getRecommendationIcon(selectedSummary.recommendation)}
                    <div>
                      <h4 className="font-semibold text-foreground">Recommendation</h4>
                      <p className="text-muted-foreground">{selectedSummary.recommendation}</p>
                    </div>
                  </div>

                  {/* Scores Grid */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Communication", score: selectedSummary.communicationScore },
                      { label: "Technical", score: selectedSummary.technicalScore },
                      { label: "Culture Fit", score: selectedSummary.cultureFitScore },
                    ].map((item, index) => (
                      <div key={index} className="p-4 bg-card rounded-xl border border-border text-center">
                        <div className="text-2xl font-bold text-foreground">{item.score}/10</div>
                        <div className="text-sm text-muted-foreground">{item.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Strengths & Improvements */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-accent/5 rounded-xl border border-accent/20">
                      <h4 className="font-semibold text-accent mb-3 flex items-center gap-2">
                        <Star className="w-4 h-4" /> Strengths
                      </h4>
                      <ul className="space-y-2">
                        {selectedSummary.strengths.map((s, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-4 bg-destructive/5 rounded-xl border border-destructive/20">
                      <h4 className="font-semibold text-destructive mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Areas for Improvement
                      </h4>
                      <ul className="space-y-2">
                        {selectedSummary.areasForImprovement.map((a, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Key Takeaways */}
                  <div className="p-4 bg-card rounded-xl border border-border">
                    <h4 className="font-semibold text-foreground mb-3">Key Takeaways</h4>
                    <ul className="space-y-2">
                      {selectedSummary.keyTakeaways.map((t, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-primary">•</span> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No AI summary available for this interview.</p>
                </div>
              )}

              {/* Video Recording */}
              {selectedInterview.recording_url && (
                <div className="p-4 bg-card rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <Video className="w-4 h-4" /> Video Recording
                    </h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!selectedInterview.recording_url) return;
                          
                          setTranscribingVideo(true);
                          const accessToken = await getFreshAccessToken();
                          if (!accessToken) {
                            setTranscribingVideo(false);
                            return;
                          }

                          try {
                            const { data, error } = await supabase.functions.invoke("transcribe-video", {
                              headers: { Authorization: `Bearer ${accessToken}` },
                              body: {
                                interviewId: selectedInterview.id,
                                recordingPath: selectedInterview.recording_url
                              }
                            });

                            if (error) throw error;

                            if (data?.success) {
                              setVideoTranscription(data.transcription);
                              setVideoTranscriptionDetailed(data.detailed || []);
                              toast({
                                title: "Transcription Complete",
                                description: "Video has been transcribed successfully.",
                              });
                            } else {
                              throw new Error(data?.error || "Transcription failed");
                            }
                          } catch (err: any) {
                            console.error("Transcription error:", err);
                            toast({
                              title: "Transcription Failed",
                              description: err.message || "Could not transcribe the video.",
                              variant: "destructive",
                            });
                          } finally {
                            setTranscribingVideo(false);
                          }
                        }}
                        disabled={transcribingVideo || !recordingUrl}
                      >
                        {transcribingVideo ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Transcribing...
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4 mr-2" />
                            Transcribe Video
                          </>
                        )}
                      </Button>
                      {videoTranscription && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              let content = `Video Transcription - ${selectedInterview.candidate_name || selectedInterview.candidate_email}\n`;
                              content += `Job Role: ${selectedInterview.job_role}\n`;
                              content += `Date: ${selectedInterview.completed_at ? new Date(selectedInterview.completed_at).toLocaleDateString() : "N/A"}\n`;
                              content += `${"=".repeat(60)}\n\n`;

                              if (videoTranscriptionDetailed.length > 0) {
                                videoTranscriptionDetailed.forEach((segment) => {
                                  content += `[${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}] ${segment.speaker}:\n`;
                                  content += `${segment.text}\n\n`;
                                });
                              } else {
                                content += videoTranscription;
                              }

                              const blob = new Blob([content], { type: "text/plain" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `video-transcription-${(selectedInterview.candidate_name || selectedInterview.candidate_email).replace(/\s+/g, "-").toLowerCase()}.txt`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);

                              toast({
                                title: "Downloaded",
                                description: "Video transcription downloaded as text file.",
                              });
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download Transcription
                          </Button>
                          <Button
                            variant={showTranscriptComparison ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowTranscriptComparison(!showTranscriptComparison)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            {showTranscriptComparison ? "Hide Comparison" : "Compare Transcripts"}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (recordingUrl) {
                            await navigator.clipboard.writeText(recordingUrl);
                            toast({
                              title: "Link Copied",
                              description: "Video link copied to clipboard. Link expires in 24 hours.",
                            });
                          }
                        }}
                        disabled={!recordingUrl}
                      >
                        <Link className="w-4 h-4 mr-2" />
                        Copy Link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVideoShareDialogOpen(true)}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Share
                      </Button>
                    </div>
                  </div>
                  {loadingRecording ? (
                    <div className="flex items-center justify-center h-64 bg-secondary/50 rounded-lg">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : recordingUrl ? (
                    <video
                      src={recordingUrl}
                      controls
                      className="w-full rounded-lg bg-black"
                      style={{ maxHeight: "400px" }}
                      onTimeUpdate={(e) => setVideoCurrentTime((e.target as HTMLVideoElement).currentTime)}
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="flex items-center justify-center h-64 bg-secondary/50 rounded-lg">
                      <p className="text-muted-foreground">Could not load video recording.</p>
                    </div>
                  )}

                  {/* Side-by-Side Transcript Comparison */}
                  {showTranscriptComparison && videoTranscription && (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-medium text-foreground flex items-center gap-2">
                          <Eye className="w-4 h-4" /> Side-by-Side Transcript Comparison
                        </h5>
                        <span className="text-xs text-muted-foreground">
                          Current time: {formatTime(videoCurrentTime)}
                        </span>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Video Transcription */}
                        <div className="bg-secondary/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h6 className="text-sm font-medium text-foreground flex items-center gap-2">
                              <Video className="w-3 h-3" /> Video Transcription
                            </h6>
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              Speech-to-Text
                            </span>
                          </div>
                          <div className="space-y-2 max-h-[250px] overflow-y-auto">
                            {videoTranscriptionDetailed.length > 0 ? (
                              videoTranscriptionDetailed.map((segment, idx) => {
                                const isActive = videoCurrentTime >= segment.startTime && videoCurrentTime <= segment.endTime;
                                return (
                                  <div
                                    key={idx}
                                    className={`p-2 rounded transition-all ${
                                      isActive
                                        ? "bg-primary/20 border border-primary/40 ring-2 ring-primary/20"
                                        : "bg-background/50"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                                        {segment.speaker}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                                      </span>
                                      {isActive && (
                                        <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded animate-pulse">
                                          NOW
                                        </span>
                                      )}
                                    </div>
                                    <p className={`text-sm ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                                      {segment.text}
                                    </p>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-sm text-muted-foreground">{videoTranscription}</p>
                            )}
                          </div>
                        </div>

                        {/* Chat Transcript */}
                        <div className="bg-secondary/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h6 className="text-sm font-medium text-foreground flex items-center gap-2">
                              <MessageSquare className="w-3 h-3" /> Chat Transcript
                            </h6>
                            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded">
                              Text-Based
                            </span>
                          </div>
                          <div className="space-y-2 max-h-[250px] overflow-y-auto">
                            {transcriptMessages.length > 0 ? (
                              transcriptMessages.map((msg, index) => (
                                <div
                                  key={index}
                                  className={`p-2 rounded ${
                                    msg.role === "user"
                                      ? "bg-primary/10 ml-4"
                                      : "bg-background/50 mr-4"
                                  }`}
                                >
                                  <p className="text-xs text-muted-foreground mb-1">
                                    {msg.role === "user" ? "Candidate" : "AI Interviewer"}
                                  </p>
                                  <p className="text-sm text-foreground">{msg.content}</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">No chat transcript available.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Comparison Summary */}
                      <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <h6 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" /> Transcript Comparison Analysis
                        </h6>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                          <div className="bg-background/50 p-2 rounded">
                            <div className="text-lg font-bold text-primary">
                              {videoTranscriptionDetailed.length || 1}
                            </div>
                            <div className="text-xs text-muted-foreground">Video Segments</div>
                          </div>
                          <div className="bg-background/50 p-2 rounded">
                            <div className="text-lg font-bold text-accent">
                              {transcriptMessages.length}
                            </div>
                            <div className="text-xs text-muted-foreground">Chat Messages</div>
                          </div>
                          <div className="bg-background/50 p-2 rounded">
                            <div className="text-lg font-bold text-foreground">
                              {videoTranscription?.split(/\s+/).length || 0}
                            </div>
                            <div className="text-xs text-muted-foreground">Video Words</div>
                          </div>
                          <div className="bg-background/50 p-2 rounded">
                            <div className="text-lg font-bold text-foreground">
                              {transcriptMessages.reduce((acc, msg) => acc + (msg.content?.split(/\s+/).length || 0), 0)}
                            </div>
                            <div className="text-xs text-muted-foreground">Chat Words</div>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          The video transcription captures the actual spoken words from the recording, while the chat transcript shows the text-based conversation. 
                          Differences may occur due to speech patterns, filler words, or interruptions not captured in text.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Full Transcript (when comparison not shown) */}
              {!showTranscriptComparison && (
                <div className="p-4 bg-card rounded-xl border border-border">
                  <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Full Transcript
                  </h4>
                  {transcriptMessages.length > 0 ? (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {transcriptMessages.map((msg, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-lg ${
                            msg.role === "user"
                              ? "bg-primary/10 ml-8"
                              : "bg-secondary mr-8"
                          }`}
                        >
                          <p className="text-xs text-muted-foreground mb-1">
                            {msg.role === "user" ? "Candidate" : "AI Interviewer"}
                          </p>
                          <p className="text-sm text-foreground">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No transcript available.</p>
                  )}
                </div>
              )}

              {/* Screenshots Gallery */}
              <InterviewScreenshotsGallery interviewId={selectedInterview.id} />

              {/* Documents */}
              {(selectedInterview.candidate_resume_url || selectedInterview.candidate_notes) && (
                <div className="p-4 bg-card rounded-xl border border-border">
                  <h4 className="font-semibold text-foreground mb-3">Candidate Documents</h4>
                  {selectedInterview.candidate_resume_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedInterview.candidate_resume_url!, "_blank")}
                      className="mr-2"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Resume
                    </Button>
                  )}
                  {selectedInterview.candidate_notes && (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground font-medium mb-1">Candidate Notes:</p>
                      <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg">
                        {selectedInterview.candidate_notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Share Dialog */}
      <Dialog open={emailShareDialogOpen} onOpenChange={setEmailShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Share via Email
            </DialogTitle>
            <DialogDescription>
              Send this interview summary to a colleague or team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="share-email">Recipient Email</Label>
              <Input
                id="share-email"
                type="email"
                placeholder="colleague@company.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
            </div>
            {selectedInterview && selectedSummary && (
              <div className="p-3 bg-secondary/50 rounded-lg text-sm">
                <p className="font-medium text-foreground">
                  {selectedInterview.candidate_name || selectedInterview.candidate_email}
                </p>
                <p className="text-muted-foreground">{selectedInterview.job_role}</p>
                {selectedInterview.score && (
                  <p className="text-primary font-medium mt-1">Score: {selectedInterview.score}/10</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailShareDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!shareEmail || !selectedInterview || !selectedSummary) return;
                
                setSendingEmail(true);
                const accessToken = await getFreshAccessToken();
                if (!accessToken) {
                  setSendingEmail(false);
                  return;
                }

                try {
                  const { error } = await supabase.functions.invoke("send-summary-email", {
                    headers: {
                      Authorization: `Bearer ${accessToken}`
                    },
                    body: {
                      recipientEmail: shareEmail,
                      candidateName: selectedInterview.candidate_name || selectedInterview.candidate_email,
                      jobRole: selectedInterview.job_role,
                      overallScore: selectedInterview.score,
                      summary: selectedSummary.summary,
                      recommendation: selectedSummary.recommendation,
                      communicationScore: selectedSummary.communicationScore,
                      technicalScore: selectedSummary.technicalScore,
                      cultureFitScore: selectedSummary.cultureFitScore,
                      strengths: selectedSummary.strengths,
                      areasForImprovement: selectedSummary.areasForImprovement,
                      keyTakeaways: selectedSummary.keyTakeaways,
                      senderName: user?.email || 'A recruiter',
                      companyName: profile.company_name || 'VantaHire',
                    }
                  });

                  if (error) throw error;

                  toast({
                    title: "Email Sent",
                    description: `Interview summary sent to ${shareEmail}`,
                  });
                  setEmailShareDialogOpen(false);
                  setShareEmail("");
                } catch (error: any) {
                  console.error("Failed to send email:", error);
                  toast({
                    variant: "destructive",
                    title: "Failed to Send",
                    description: error.message || "Could not send the email. Please try again.",
                  });
                } finally {
                  setSendingEmail(false);
                }
              }}
              disabled={!shareEmail || sendingEmail}
            >
              {sendingEmail ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Share Dialog */}
      <Dialog open={videoShareDialogOpen} onOpenChange={setVideoShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5" />
              Share Video Recording
            </DialogTitle>
            <DialogDescription>
              Send the interview video recording to a colleague or team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="video-share-email">Recipient Email</Label>
              <Input
                id="video-share-email"
                type="email"
                placeholder="colleague@company.com"
                value={videoShareEmail}
                onChange={(e) => setVideoShareEmail(e.target.value)}
              />
            </div>
            {selectedInterview && (
              <div className="p-3 bg-secondary/50 rounded-lg text-sm">
                <p className="font-medium text-foreground">
                  {selectedInterview.candidate_name || selectedInterview.candidate_email}
                </p>
                <p className="text-muted-foreground">{selectedInterview.job_role}</p>
                <p className="text-muted-foreground text-xs mt-1 flex items-center gap-1">
                  <Video className="w-3 h-3" /> Video recording included
                </p>
              </div>
            )}
            <div className="text-xs text-muted-foreground bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
              <strong>Note:</strong> The video link will expire in 7 days. The recipient will need to download it before then.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoShareDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!videoShareEmail || !selectedInterview || !selectedInterview.recording_url) return;
                
                setSendingVideoEmail(true);
                
                try {
                  // Generate a longer-lived signed URL (7 days)
                  const { data: urlData, error: urlError } = await supabase.storage
                    .from('interview-documents')
                    .createSignedUrl(selectedInterview.recording_url, 60 * 60 * 24 * 7);
                  
                  if (urlError || !urlData?.signedUrl) {
                    throw new Error("Could not generate video link");
                  }

                  const accessToken = await getFreshAccessToken();
                  if (!accessToken) {
                    setSendingVideoEmail(false);
                    return;
                  }

                  const { error } = await supabase.functions.invoke("send-summary-email", {
                    headers: {
                      Authorization: `Bearer ${accessToken}`
                    },
                    body: {
                      recipientEmail: videoShareEmail,
                      candidateName: selectedInterview.candidate_name || selectedInterview.candidate_email,
                      jobRole: selectedInterview.job_role,
                      overallScore: selectedInterview.score,
                      summary: `Video recording of the interview is available.\n\n📹 Watch Recording: ${urlData.signedUrl}\n\nNote: This link expires in 7 days.`,
                      recommendation: "Please watch the video recording for a complete assessment.",
                      communicationScore: 0,
                      technicalScore: 0,
                      cultureFitScore: 0,
                      strengths: ["Video recording available for review"],
                      areasForImprovement: [],
                      keyTakeaways: ["Watch the full interview recording for detailed assessment"],
                      senderName: user?.email || 'A recruiter',
                      companyName: profile.company_name || 'VantaHire',
                      videoUrl: urlData.signedUrl,
                    }
                  });

                  if (error) throw error;

                  toast({
                    title: "Video Shared",
                    description: `Video recording sent to ${videoShareEmail}`,
                  });
                  setVideoShareDialogOpen(false);
                  setVideoShareEmail("");
                } catch (error: any) {
                  console.error("Failed to share video:", error);
                  toast({
                    variant: "destructive",
                    title: "Failed to Share",
                    description: error.message || "Could not share the video. Please try again.",
                  });
                } finally {
                  setSendingVideoEmail(false);
                }
              }}
              disabled={!videoShareEmail || sendingVideoEmail}
            >
              {sendingVideoEmail ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Video
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
};

export default Dashboard;
