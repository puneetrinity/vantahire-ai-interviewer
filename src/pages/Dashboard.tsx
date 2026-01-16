import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { useAuth } from "@/hooks/useAuth";
import { useInterviewStatus } from "@/hooks/useSocket";
import {
  interviews as interviewsApi,
  jobs as jobsApi,
  files as filesApi,
  type Interview,
  type InterviewMessage,
  type RecruiterProfile,
} from "@/lib/api";
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
  Award,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Target,
  Sparkles,
} from "lucide-react";

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

// Helper function to format time in seconds to MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Dashboard = () => {
  const {
    user,
    recruiterProfile,
    isLoading: authLoading,
    isAuthenticated,
    isAdmin,
    isCandidate,
    logout,
  } = useAuth();
  const [interviewsList, setInterviewsList] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [transcriptMessages, setTranscriptMessages] = useState<InterviewMessage[]>([]);
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
  const [finalRecommendation, setFinalRecommendation] = useState<FinalRecommendation | null>(null);
  const [generatingRecommendation, setGeneratingRecommendation] = useState(false);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [jobsCount, setJobsCount] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Get interview IDs for WhatsApp status tracking
  const interviewIds = useMemo(() => interviewsList.map(i => i.id), [interviewsList]);
  const { whatsappMessages } = useWhatsAppStatus(interviewIds);

  // Subscribe to interview status updates via Socket.io
  useInterviewStatus(
    interviewIds.length > 0 ? interviewIds[0] : undefined,
    useCallback((data) => {
      // Refetch interviews when status changes
      fetchInterviews();
    }, [])
  );

  // Profile with defaults from API
  const profile: RecruiterProfile = recruiterProfile || {
    id: '',
    userId: '',
    companyName: null,
    logoFileId: null,
    brandColor: '#6366f1',
    emailIntro: null,
    emailTips: null,
    emailCtaText: null,
    subscriptionStatus: 'FREE',
  };

  // Fetch interviews
  const fetchInterviews = useCallback(async () => {
    try {
      const response = await interviewsApi.list();
      setInterviewsList(response.data);
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
  }, [toast]);

  // Fetch jobs count for onboarding progress
  const fetchJobsCount = useCallback(async () => {
    try {
      const response = await jobsApi.list({ limit: 1 });
      setJobsCount(response.pagination.total);
    } catch (error) {
      console.error("Error fetching jobs count:", error);
    }
  }, []);

  // Auth and redirect logic
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }

    // Redirect candidates to their dashboard
    if (isCandidate) {
      navigate("/candidate/dashboard");
      return;
    }

    // Fetch data
    fetchInterviews();
    fetchJobsCount();
  }, [authLoading, isAuthenticated, isCandidate, navigate, fetchInterviews, fetchJobsCount]);

  const fetchTranscript = async (interviewId: string) => {
    try {
      const messages = await interviewsApi.getTranscript(interviewId);
      setTranscriptMessages(messages);
    } catch (error) {
      console.error("Error fetching transcript:", error);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  const handleCreateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

    try {
      const data = await interviewsApi.create({
        candidateEmail: newInterview.email,
        candidateName: newInterview.name || undefined,
        jobRole: "General Interview",
        type: "VOICE",
        timeLimitMinutes: 30,
        candidatePhone: newInterview.phone || undefined,
      });

      // Send invitation email
      try {
        await interviewsApi.sendEmailInvite(data.id);
        toast({
          title: "Interview Created & Email Sent",
          description: `Invitation email sent to ${newInterview.email}`
        });
      } catch (emailErr: any) {
        console.error("Email sending error:", emailErr);
        toast({
          title: "Interview Created",
          description: "Interview created but email notification failed. Share the link manually."
        });
      }

      setInterviewsList([data, ...interviewsList]);
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

    try {
      await interviewsApi.sendEmailInvite(interview.id);
      toast({
        title: "Email Sent",
        description: `Invitation resent to ${interview.candidateEmail}`
      });
    } catch (error: any) {
      console.error("Failed to resend invite:", error);
      toast({
        variant: "destructive",
        title: "Failed to Send",
        description: "Could not resend invitation email. Please try again."
      });
    } finally {
      setResendingEmail(null);
    }
  };

  const resendWhatsAppInvite = async (interview: Interview) => {
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

    try {
      await interviewsApi.sendWhatsAppInvite(interview.id, whatsappMessage.candidate_phone);
      toast({
        title: "WhatsApp Sent",
        description: `Invitation resent to ${whatsappMessage.candidate_phone}`
      });
    } catch (error: any) {
      console.error("Failed to resend WhatsApp:", error);
      toast({
        variant: "destructive",
        title: "Failed to Send",
        description: "Could not resend WhatsApp invitation. Please try again."
      });
    } finally {
      setResendingWhatsApp(null);
    }
  };

  const regenerateSummary = async (interview: Interview) => {
    setRegeneratingSummary(interview.id);

    try {
      await interviewsApi.regenerateSummary(interview.id);
      toast({
        title: "Summary Generated",
        description: `AI summary has been generated for ${interview.candidateName || interview.candidateEmail}`
      });
      fetchInterviews();
    } catch (error: any) {
      console.error("Failed to regenerate summary:", error);
      toast({
        variant: "destructive",
        title: "Failed to Generate",
        description: "Could not generate AI summary. Please try again."
      });
    } finally {
      setRegeneratingSummary(null);
    }
  };

  const handleBulkInvite = async (candidates: { email: string; name: string; jobRole: string }[]) => {
    if (!user) return [];

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const candidate of candidates) {
      try {
        const data = await interviewsApi.create({
          candidateEmail: candidate.email,
          candidateName: candidate.name || undefined,
          jobRole: candidate.jobRole,
          type: "VOICE",
          timeLimitMinutes: 30,
        });

        try {
          await interviewsApi.sendEmailInvite(data.id);
        } catch (emailError) {
          console.warn(`Email failed for ${candidate.email}:`, emailError);
        }

        setInterviewsList(prev => [data, ...prev]);
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
      await interviewsApi.delete(id);
      setInterviewsList(interviewsList.filter(i => i.id !== id));
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
    setFinalRecommendation(null);
    await fetchTranscript(interview.id);

    // Load stored video transcription and final recommendation from candidateNotes
    if (interview.candidateNotes) {
      try {
        const notes = JSON.parse(interview.candidateNotes);
        if (notes.video_transcription) {
          setVideoTranscription(notes.video_transcription);
          setShowTranscriptComparison(true);
        }
        if (notes.video_transcription_detailed) {
          setVideoTranscriptionDetailed(notes.video_transcription_detailed);
        }
        if (notes.final_recommendation) {
          setFinalRecommendation(notes.final_recommendation);
        }
      } catch (e) {
        console.log("Could not parse candidateNotes as JSON");
      }
    }

    // Load recording URL if available
    if (interview.recordingGcsKey) {
      setLoadingRecording(true);
      try {
        const url = await interviewsApi.getRecordingUrl(interview.id);
        setRecordingUrl(url);
      } catch (err) {
        console.error("Failed to load recording:", err);
      } finally {
        setLoadingRecording(false);
      }
    }
  };

  const generateFinalRecommendation = async () => {
    if (!selectedInterview) return;

    setGeneratingRecommendation(true);
    try {
      const chatTranscriptText = transcriptMessages
        .map(msg => `${msg.role === "user" ? "Candidate" : "AI Interviewer"}: ${msg.content}`)
        .join("\n\n");

      const response = await interviewsApi.generateFinalRecommendation(selectedInterview.id, {
        videoTranscription: videoTranscription || "",
        chatTranscript: chatTranscriptText,
      });

      if (response?.recommendation) {
        setFinalRecommendation(response.recommendation as FinalRecommendation);
        toast({
          title: "Recommendation Generated",
          description: "Final hiring recommendation has been generated."
        });
      } else {
        throw new Error("No recommendation in response");
      }
    } catch (error: any) {
      console.error("Failed to generate recommendation:", error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: error.message || "Could not generate final recommendation. Please try again."
      });
    } finally {
      setGeneratingRecommendation(false);
    }
  };

  const downloadFinalRecommendation = () => {
    if (!finalRecommendation || !selectedInterview) return;

    const content = `FINAL INTERVIEW RECOMMENDATION
========================================

CANDIDATE: ${selectedInterview.candidateName || selectedInterview.candidateEmail}
POSITION: ${selectedInterview.jobRole}
DATE: ${new Date().toLocaleDateString()}

----------------------------------------
OVERALL ASSESSMENT
----------------------------------------
${finalRecommendation.overallAssessment}

HIRING RECOMMENDATION: ${finalRecommendation.hiringRecommendation}
CONFIDENCE SCORE: ${finalRecommendation.confidenceScore}%

----------------------------------------
FINAL VERDICT
----------------------------------------
${finalRecommendation.finalVerdict}

----------------------------------------
KEY FINDINGS
----------------------------------------

Consistencies (Video vs Chat):
${finalRecommendation.keyFindings.consistencies.map(c => `• ${c}`).join('\n')}

Discrepancies:
${finalRecommendation.keyFindings.discrepancies.length > 0
  ? finalRecommendation.keyFindings.discrepancies.map(d => `• ${d}`).join('\n')
  : '• No significant discrepancies found'}

----------------------------------------
COMMUNICATION ANALYSIS
----------------------------------------
Clarity: ${finalRecommendation.communicationAnalysis.clarity}/10
Confidence: ${finalRecommendation.communicationAnalysis.confidence}/10
Professional Tone: ${finalRecommendation.communicationAnalysis.professionalTone}/10

Observations:
${finalRecommendation.communicationAnalysis.observations.map(o => `• ${o}`).join('\n')}

----------------------------------------
TECHNICAL ASSESSMENT
----------------------------------------
Score: ${finalRecommendation.technicalAssessment.score}/10

Strengths:
${finalRecommendation.technicalAssessment.strengths.map(s => `• ${s}`).join('\n')}

Areas for Improvement:
${finalRecommendation.technicalAssessment.gaps.map(g => `• ${g}`).join('\n')}

----------------------------------------
GREEN FLAGS
----------------------------------------
${finalRecommendation.greenFlags.map(g => `✓ ${g}`).join('\n')}

----------------------------------------
RED FLAGS
----------------------------------------
${finalRecommendation.redFlags.length > 0
  ? finalRecommendation.redFlags.map(r => `⚠ ${r}`).join('\n')
  : '• No significant red flags identified'}

----------------------------------------
CULTURE FIT INDICATORS
----------------------------------------
${finalRecommendation.cultureFitIndicators.map(c => `• ${c}`).join('\n')}

----------------------------------------
SUGGESTED NEXT STEPS
----------------------------------------
${finalRecommendation.suggestedNextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

========================================
Generated by VantaHire AI Interview Platform
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `final-recommendation-${selectedInterview.candidateName || 'candidate'}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Final recommendation saved to file."
    });
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case "Strongly Recommend": return "bg-accent/20 text-accent border-accent/40";
      case "Recommend": return "bg-green-500/20 text-green-400 border-green-500/40";
      case "Proceed with Caution": return "bg-amber-500/20 text-amber-400 border-amber-500/40";
      case "Do Not Recommend": return "bg-destructive/20 text-destructive border-destructive/40";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-accent/20 text-accent";
      case "IN_PROGRESS": return "bg-primary/20 text-primary";
      case "PENDING": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const parseSummary = (summaryJson: string | null): InterviewSummary | null => {
    if (!summaryJson) return null;
    try {
      return JSON.parse(summaryJson);
    } catch {
      try {
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
    total: interviewsList.length,
    completed: interviewsList.filter(i => i.status === "COMPLETED").length,
    pending: interviewsList.filter(i => i.status === "PENDING").length,
    avgScore: interviewsList.filter(i => i.score).reduce((acc, i) => acc + (i.score || 0), 0) /
              (interviewsList.filter(i => i.score).length || 1)
  };

  if (authLoading || loading) {
    return <PageLoadingSkeleton variant="dashboard" showFooter />;
  }

  const selectedSummary = selectedInterview ? parseSummary(selectedInterview.transcriptSummary) : null;

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
          hasCandidates={interviewsList.length > 0}
          hasCompletedInterview={interviewsList.some(i => i.status === "COMPLETED")}
          hasBrandingSetup={!!(profile.logoFileId || profile.companyName)}
          onCreateJob={() => {
            const jobsTab = document.querySelector('[value="jobs"]') as HTMLButtonElement;
            if (jobsTab) jobsTab.click();
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

          {interviewsList.length === 0 ? (
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
              {interviewsList.map((interview) => (
                <div
                  key={interview.id}
                  className="p-4 hover:bg-secondary/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-semibold">
                      {(interview.candidateName || interview.candidateEmail)
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        {interview.candidateName || interview.candidateEmail}
                      </div>
                      <div className="text-sm text-muted-foreground">{interview.jobRole}</div>
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
                      {interview.status.replace("_", " ").toLowerCase()}
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
                      {interview.status === "COMPLETED" && (
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
                              if (interview.recordingGcsKey) {
                                try {
                                  const { signedUrl } = await filesApi.getSignedUrl(interview.recordingGcsKey, 60 * 60);
                                  window.open(signedUrl, "_blank");
                                } catch (err) {
                                  toast({
                                    variant: "destructive",
                                    title: "Error",
                                    description: "Could not access recording. It may have expired.",
                                  });
                                }
                              } else {
                                toast({
                                  title: "No Recording",
                                  description: "This interview was completed before recording was available.",
                                });
                              }
                            }}
                            title={interview.recordingGcsKey ? "Watch Recording" : "No recording available"}
                            className={!interview.recordingGcsKey ? "opacity-50" : ""}
                          >
                            <Video className={`w-4 h-4 ${interview.recordingGcsKey ? "text-accent" : "text-muted-foreground"}`} />
                          </Button>
                          {!interview.transcriptSummary && (
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
                      {interview.status === "PENDING" && (
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
                          const summaryText = `Interview Summary - ${selectedInterview.candidateName || selectedInterview.candidateEmail}
Role: ${selectedInterview.jobRole}
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
                          const doc = new jsPDF();
                          const candidateName = selectedInterview.candidateName || selectedInterview.candidateEmail;
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
                          doc.text(profile.companyName || "VantaHire", pageWidth / 2, 34, { align: "center" });

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
                          doc.text(selectedInterview.jobRole, margin, yPos);

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
                          const summaryText = `Interview Summary - ${selectedInterview.candidateName || selectedInterview.candidateEmail}
================================================================================
Role: ${selectedInterview.jobRole}
Date: ${selectedInterview.completedAt ? new Date(selectedInterview.completedAt).toLocaleDateString() : 'N/A'}
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
                          a.download = `interview-summary-${(selectedInterview.candidateName || selectedInterview.candidateEmail).replace(/\s+/g, '-').toLowerCase()}.txt`;
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
                  {(selectedInterview.candidateName || selectedInterview.candidateEmail)
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    {selectedInterview.candidateName || selectedInterview.candidateEmail}
                  </div>
                  <div className="text-sm text-muted-foreground">{selectedInterview.jobRole}</div>
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
              {selectedInterview.recordingGcsKey && (
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
                          if (!selectedInterview.id) return;

                          setTranscribingVideo(true);
                          try {
                            const data = await interviewsApi.transcribeRecording(selectedInterview.id);

                            if (data?.success) {
                              setVideoTranscription(data.transcription);
                              setVideoTranscriptionDetailed(data.detailed || []);
                              toast({
                                title: "Transcription Complete",
                                description: "Video has been transcribed successfully.",
                              });
                            } else {
                              throw new Error("Transcription failed");
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
                              let content = `Video Transcription - ${selectedInterview.candidateName || selectedInterview.candidateEmail}\n`;
                              content += `Job Role: ${selectedInterview.jobRole}\n`;
                              content += `Date: ${selectedInterview.completedAt ? new Date(selectedInterview.completedAt).toLocaleDateString() : "N/A"}\n`;
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
                              a.download = `video-transcription-${(selectedInterview.candidateName || selectedInterview.candidateEmail).replace(/\s+/g, "-").toLowerCase()}.txt`;
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

                      {/* Generate Final Recommendation Button */}
                      <div className="mt-4 flex justify-center">
                        <Button
                          onClick={generateFinalRecommendation}
                          disabled={generatingRecommendation || (!videoTranscription && transcriptMessages.length === 0)}
                          className="gap-2"
                        >
                          {generatingRecommendation ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Analyzing Transcripts...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Generate Final Recommendation
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Final AI Recommendation */}
              {finalRecommendation && (
                <div className="p-4 bg-card rounded-xl border-2 border-primary/30 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <Award className="w-5 h-5 text-primary" /> Final AI Recommendation
                    </h4>
                    <Button variant="outline" size="sm" onClick={downloadFinalRecommendation}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Report
                    </Button>
                  </div>

                  {/* Hiring Recommendation Badge */}
                  <div className="flex items-center justify-center mb-6">
                    <div className={`px-6 py-3 rounded-full border-2 ${getRecommendationColor(finalRecommendation.hiringRecommendation)}`}>
                      <div className="flex items-center gap-3">
                        {finalRecommendation.hiringRecommendation === "Strongly Recommend" || finalRecommendation.hiringRecommendation === "Recommend" ? (
                          <ThumbsUp className="w-6 h-6" />
                        ) : finalRecommendation.hiringRecommendation === "Do Not Recommend" ? (
                          <ThumbsDown className="w-6 h-6" />
                        ) : (
                          <AlertTriangle className="w-6 h-6" />
                        )}
                        <div className="text-center">
                          <div className="text-lg font-bold">{finalRecommendation.hiringRecommendation}</div>
                          <div className="text-xs opacity-80">Confidence: {finalRecommendation.confidenceScore}%</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Overall Assessment */}
                  <div className="bg-secondary/30 p-4 rounded-lg mb-4">
                    <h5 className="font-medium text-foreground mb-2">Overall Assessment</h5>
                    <p className="text-sm text-muted-foreground">{finalRecommendation.overallAssessment}</p>
                  </div>

                  {/* Final Verdict */}
                  <div className="bg-primary/10 p-4 rounded-lg mb-4 border border-primary/30">
                    <h5 className="font-medium text-primary mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4" /> Final Verdict
                    </h5>
                    <p className="text-sm text-foreground font-medium">{finalRecommendation.finalVerdict}</p>
                  </div>

                  {/* Scores Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-background/50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-primary">{finalRecommendation.communicationAnalysis.clarity}/10</div>
                      <div className="text-xs text-muted-foreground">Clarity</div>
                    </div>
                    <div className="bg-background/50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-accent">{finalRecommendation.communicationAnalysis.confidence}/10</div>
                      <div className="text-xs text-muted-foreground">Confidence</div>
                    </div>
                    <div className="bg-background/50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-foreground">{finalRecommendation.communicationAnalysis.professionalTone}/10</div>
                      <div className="text-xs text-muted-foreground">Professional Tone</div>
                    </div>
                    <div className="bg-background/50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-foreground">{finalRecommendation.technicalAssessment.score}/10</div>
                      <div className="text-xs text-muted-foreground">Technical</div>
                    </div>
                  </div>

                  {/* Key Findings */}
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    {/* Green Flags */}
                    <div className="bg-accent/5 p-3 rounded-lg border border-accent/20">
                      <h6 className="font-medium text-accent mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> Green Flags
                      </h6>
                      <ul className="space-y-1">
                        {finalRecommendation.greenFlags.map((flag, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-accent mt-1">✓</span> {flag}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Red Flags */}
                    <div className="bg-destructive/5 p-3 rounded-lg border border-destructive/20">
                      <h6 className="font-medium text-destructive mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Red Flags
                      </h6>
                      {finalRecommendation.redFlags.length > 0 ? (
                        <ul className="space-y-1">
                          {finalRecommendation.redFlags.map((flag, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-destructive mt-1">⚠</span> {flag}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No significant red flags identified.</p>
                      )}
                    </div>
                  </div>

                  {/* Video vs Chat Comparison */}
                  {(finalRecommendation.keyFindings.consistencies.length > 0 || finalRecommendation.keyFindings.discrepancies.length > 0) && (
                    <div className="bg-secondary/20 p-3 rounded-lg mb-4">
                      <h6 className="font-medium text-foreground mb-2 flex items-center gap-2">
                        <Eye className="w-4 h-4" /> Video vs Chat Comparison
                      </h6>
                      {finalRecommendation.keyFindings.consistencies.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Consistencies</p>
                          <ul className="space-y-1">
                            {finalRecommendation.keyFindings.consistencies.map((item, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {finalRecommendation.keyFindings.discrepancies.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Discrepancies</p>
                          <ul className="space-y-1">
                            {finalRecommendation.keyFindings.discrepancies.map((item, idx) => (
                              <li key={idx} className="text-sm text-amber-400">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Technical Assessment */}
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-background/50 p-3 rounded-lg">
                      <h6 className="font-medium text-foreground mb-2">Technical Strengths</h6>
                      <ul className="space-y-1">
                        {finalRecommendation.technicalAssessment.strengths.map((strength, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground">• {strength}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-background/50 p-3 rounded-lg">
                      <h6 className="font-medium text-foreground mb-2">Areas for Growth</h6>
                      <ul className="space-y-1">
                        {finalRecommendation.technicalAssessment.gaps.map((gap, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground">• {gap}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Suggested Next Steps */}
                  <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                    <h6 className="font-medium text-primary mb-2">Suggested Next Steps</h6>
                    <ol className="space-y-1">
                      {finalRecommendation.suggestedNextSteps.map((step, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          <span className="text-primary font-medium">{idx + 1}.</span> {step}
                        </li>
                      ))}
                    </ol>
                  </div>
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
              {(selectedInterview.candidateResumeFileId || selectedInterview.candidateNotes) && (
                <div className="p-4 bg-card rounded-xl border border-border">
                  <h4 className="font-semibold text-foreground mb-3">Candidate Documents</h4>
                  {selectedInterview.candidateResumeFileId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(filesApi.getUrl(selectedInterview.candidateResumeFileId!), "_blank")}
                      className="mr-2"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Resume
                    </Button>
                  )}
                  {selectedInterview.candidateNotes && (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground font-medium mb-1">Candidate Notes:</p>
                      <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg">
                        {selectedInterview.candidateNotes}
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
                  {selectedInterview.candidateName || selectedInterview.candidateEmail}
                </p>
                <p className="text-muted-foreground">{selectedInterview.jobRole}</p>
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
                if (!shareEmail || !selectedInterview) return;

                setSendingEmail(true);
                try {
                  await interviewsApi.shareSummary(selectedInterview.id, {
                    recipientEmail: shareEmail,
                    includeVideo: false,
                  });

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
                  {selectedInterview.candidateName || selectedInterview.candidateEmail}
                </p>
                <p className="text-muted-foreground">{selectedInterview.jobRole}</p>
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
                if (!videoShareEmail || !selectedInterview) return;

                setSendingVideoEmail(true);
                try {
                  await interviewsApi.shareSummary(selectedInterview.id, {
                    recipientEmail: videoShareEmail,
                    includeVideo: true,
                  });

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
