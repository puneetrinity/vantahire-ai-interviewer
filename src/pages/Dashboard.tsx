import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Zap,
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
  Mail,
  Settings,
  Palette
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

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [transcriptMessages, setTranscriptMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [newInterview, setNewInterview] = useState({
    candidateEmail: "",
    candidateName: "",
    jobRole: ""
  });
  const [creating, setCreating] = useState(false);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<RecruiterProfile>({
    company_name: null,
    brand_color: '#6366f1',
    logo_url: null
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        fetchInterviews();
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
        .select("company_name, brand_color, logo_url")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setProfile({
          company_name: data.company_name,
          brand_color: data.brand_color || '#6366f1',
          logo_url: data.logo_url
        });
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          company_name: profile.company_name,
          brand_color: profile.brand_color,
          logo_url: profile.logo_url
        })
        .eq("id", user.id);

      if (error) throw error;
      
      toast({
        title: "Settings Saved",
        description: "Your branding settings have been updated."
      });
      setSettingsDialogOpen(false);
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings"
      });
    } finally {
      setSavingProfile(false);
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
          candidate_email: newInterview.candidateEmail,
          candidate_name: newInterview.candidateName || null,
          job_role: newInterview.jobRole,
          status: "pending",
          time_limit_minutes: 30
        })
        .select()
        .single();

      if (error) throw error;

      // Send invitation email to candidate
      const interviewUrl = `${window.location.origin}/voice-interview/${data.id}`;
      
      try {
        const { error: emailError } = await supabase.functions.invoke("send-candidate-invite", {
          body: {
            candidateEmail: newInterview.candidateEmail,
            candidateName: newInterview.candidateName || null,
            jobRole: newInterview.jobRole,
            interviewId: data.id,
            interviewUrl,
            recruiterId: user.id
          }
        });

        if (emailError) {
          console.error("Failed to send invitation email:", emailError);
          toast({
            title: "Interview Created",
            description: "Interview created but email notification failed. Share the link manually."
          });
        } else {
          toast({
            title: "Interview Created & Email Sent",
            description: `Invitation email sent to ${newInterview.candidateEmail}`
          });
        }
      } catch (emailErr) {
        console.error("Email sending error:", emailErr);
        toast({
          title: "Interview Created",
          description: "Interview created but email notification failed. Share the link manually."
        });
      }

      setInterviews([data as Interview, ...interviews]);
      setCreateDialogOpen(false);
      setNewInterview({ candidateEmail: "", candidateName: "", jobRole: "" });
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
    const interviewUrl = `${window.location.origin}/voice-interview/${interview.id}`;
    
    try {
      const { error } = await supabase.functions.invoke("send-candidate-invite", {
        body: {
          candidateEmail: interview.candidate_email,
          candidateName: interview.candidate_name,
          jobRole: interview.job_role,
          interviewId: interview.id,
          interviewUrl,
          recruiterId: user?.id
        }
      });

      if (error) throw error;

      toast({
        title: "Email Sent",
        description: `Invitation resent to ${interview.candidate_email}`
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
    await fetchTranscript(interview.id);
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const selectedSummary = selectedInterview ? parseSummary(selectedInterview.transcript_summary) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-bg flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">InterviewAI</span>
          </a>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setSettingsDialogOpen(true)} title="Branding Settings">
              <Settings className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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

        {/* Interviews List */}
        <div className="bg-card rounded-2xl border border-border">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Interviews</h2>
              <p className="text-sm text-muted-foreground">Manage your candidate interviews</p>
            </div>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="hero">
                  <Plus className="w-4 h-4 mr-2" />
                  New Interview
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Interview</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateInterview} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="candidateEmail">Candidate Email *</Label>
                    <Input
                      id="candidateEmail"
                      type="email"
                      placeholder="candidate@email.com"
                      value={newInterview.candidateEmail}
                      onChange={(e) => setNewInterview({...newInterview, candidateEmail: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="candidateName">Candidate Name</Label>
                    <Input
                      id="candidateName"
                      type="text"
                      placeholder="John Doe"
                      value={newInterview.candidateName}
                      onChange={(e) => setNewInterview({...newInterview, candidateName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobRole">Job Role *</Label>
                    <Input
                      id="jobRole"
                      type="text"
                      placeholder="Senior Software Engineer"
                      value={newInterview.jobRole}
                      onChange={(e) => setNewInterview({...newInterview, jobRole: e.target.value})}
                      required
                    />
                  </div>
                  <Button type="submit" variant="hero" className="w-full" disabled={creating}>
                    {creating ? "Creating..." : "Create Interview"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

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
                            onClick={() => {
                              if (interview.recording_url) {
                                window.open(interview.recording_url, "_blank");
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
                        </>
                      )}
                      {interview.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => resendInviteEmail(interview)}
                          disabled={resendingEmail === interview.id}
                          title="Resend invite email"
                        >
                          <Mail className={`w-4 h-4 ${resendingEmail === interview.id ? "animate-pulse" : ""}`} />
                        </Button>
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
      </main>

      {/* Summary Dialog */}
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Interview Summary
            </DialogTitle>
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

              {/* Transcript */}
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

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Email Branding Settings
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            <p className="text-sm text-muted-foreground">
              Customize how your interview invitation and completion emails appear to candidates.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Your Company Name"
                value={profile.company_name || ""}
                onChange={(e) => setProfile({...profile, company_name: e.target.value || null})}
              />
              <p className="text-xs text-muted-foreground">
                This will appear in email headers and as the sender name.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="brandColor">Brand Color</Label>
              <div className="flex gap-2">
                <Input
                  id="brandColor"
                  type="color"
                  value={profile.brand_color}
                  onChange={(e) => setProfile({...profile, brand_color: e.target.value})}
                  className="w-14 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={profile.brand_color}
                  onChange={(e) => setProfile({...profile, brand_color: e.target.value})}
                  placeholder="#6366f1"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for buttons, headers, and accent colors in emails.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL (optional)</Label>
              <Input
                id="logoUrl"
                type="url"
                placeholder="https://yoursite.com/logo.png"
                value={profile.logo_url || ""}
                onChange={(e) => setProfile({...profile, logo_url: e.target.value || null})}
              />
              <p className="text-xs text-muted-foreground">
                Your company logo will appear at the top of emails.
              </p>
            </div>
            
            {/* Preview */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div 
                className="p-4 text-center"
                style={{ background: `linear-gradient(135deg, ${profile.brand_color}, ${adjustColor(profile.brand_color, 30)})` }}
              >
                {profile.logo_url && (
                  <img 
                    src={profile.logo_url} 
                    alt="Logo preview" 
                    className="max-h-8 mx-auto mb-2"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <div className="text-white font-bold">{profile.company_name || "Your Company"}</div>
                <div className="text-white/80 text-xs">Email Header Preview</div>
              </div>
            </div>
            
            <Button onClick={saveProfile} variant="hero" className="w-full" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
