import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import CreateJobDialog from "./CreateJobDialog";
import AddCandidateToJobDialog from "./AddCandidateToJobDialog";
import JobBulkInviteDialog from "./JobBulkInviteDialog";
import {
  Briefcase,
  Plus,
  Users,
  MapPin,
  DollarSign,
  Building,
  MoreVertical,
  UserPlus,
  Mail,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@supabase/supabase-js";

interface Job {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  salary_range: string | null;
  location: string | null;
  job_type: string | null;
  status: string;
  created_at: string;
}

interface Interview {
  id: string;
  candidate_email: string;
  candidate_name: string | null;
  job_role: string;
  status: string;
  score: number | null;
  created_at: string;
  job_id: string | null;
}

interface JobsTabProps {
  user: User | null;
}

const JobsTab = ({ user }: JobsTabProps) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchInterviews();
    }
  }, [user]);

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error("Error fetching jobs:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load jobs"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInterviews = async () => {
    try {
      const { data, error } = await supabase
        .from("interviews")
        .select("id, candidate_email, candidate_name, job_role, status, score, created_at, job_id")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInterviews(data || []);
    } catch (error: any) {
      console.error("Error fetching interviews:", error);
    }
  };

  const getFreshAccessToken = async (): Promise<string | null> => {
    try {
      let { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          toast({
            variant: "destructive",
            title: "Session Expired",
            description: "Please log in again to continue."
          });
          return null;
        }
        session = refreshData.session;
      }
      
      return session.access_token;
    } catch (e) {
      console.error("Session error:", e);
      return null;
    }
  };

  const handleCreateJob = async (jobData: {
    title: string;
    description: string;
    department: string;
    salary_range: string;
    location: string;
    job_type: string;
  }) => {
    if (!user) return;

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        recruiter_id: user.id,
        title: jobData.title,
        description: jobData.description || null,
        department: jobData.department || null,
        salary_range: jobData.salary_range || null,
        location: jobData.location || null,
        job_type: jobData.job_type
      })
      .select()
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create job"
      });
      throw error;
    }

    setJobs([data, ...jobs]);
    toast({
      title: "Job Created",
      description: `${jobData.title} has been created successfully.`
    });
  };

  const handleAddCandidate = async (candidate: { email: string; name: string; phone?: string }) => {
    if (!user || !selectedJob) return;

    // Create interview linked to job
    const { data, error } = await supabase
      .from("interviews")
      .insert({
        recruiter_id: user.id,
        candidate_email: candidate.email,
        candidate_name: candidate.name || null,
        job_role: selectedJob.title,
        job_id: selectedJob.id,
        status: "pending",
        time_limit_minutes: 30
      })
      .select()
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add candidate"
      });
      throw error;
    }

    // Send invitation email
    const accessToken = await getFreshAccessToken();
    if (accessToken) {
      const interviewUrl = `${window.location.origin}/voice-interview/${data.id}`;
      
      try {
        // Send email invite
        await supabase.functions.invoke("send-candidate-invite", {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            candidateEmail: candidate.email,
            candidateName: candidate.name || null,
            jobRole: selectedJob.title,
            interviewId: data.id,
            interviewUrl,
            recruiterId: user.id
          }
        });

        // Send WhatsApp invite if phone number is provided
        if (candidate.phone && candidate.phone.trim()) {
          try {
            await supabase.functions.invoke("send-whatsapp-invite", {
              headers: { Authorization: `Bearer ${accessToken}` },
              body: {
                candidatePhone: candidate.phone,
                candidateName: candidate.name || null,
                jobRole: selectedJob.title,
                interviewId: data.id,
                interviewUrl,
                recruiterId: user.id
              }
            });
            toast({
              title: "Candidate Added",
              description: `Email and WhatsApp invitation sent to ${candidate.email}`
            });
          } catch (whatsappErr) {
            console.error("WhatsApp error:", whatsappErr);
            toast({
              title: "Candidate Added",
              description: `Email sent to ${candidate.email}. WhatsApp invite failed.`
            });
          }
        } else {
          toast({
            title: "Candidate Added",
            description: `Invitation sent to ${candidate.email}`
          });
        }
      } catch (emailErr) {
        console.error("Email error:", emailErr);
        toast({
          title: "Candidate Added",
          description: "Interview created but email failed. Share the link manually."
        });
      }
    }

    setInterviews([data as Interview, ...interviews]);
  };

  const handleBulkInvite = async (candidates: { email: string; name: string; phone?: string }[], sendWhatsApp: boolean) => {
    if (!user || !selectedJob) return [];

    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      return candidates.map(c => ({ email: c.email, success: false, error: "Session expired" }));
    }

    const results: { email: string; success: boolean; error?: string; whatsappSent?: boolean }[] = [];

    for (const candidate of candidates) {
      try {
        const { data, error } = await supabase
          .from("interviews")
          .insert({
            recruiter_id: user.id,
            candidate_email: candidate.email,
            candidate_name: candidate.name || null,
            job_role: selectedJob.title,
            job_id: selectedJob.id,
            status: "pending",
            time_limit_minutes: 30
          })
          .select()
          .single();

        if (error) throw error;

        const interviewUrl = `${window.location.origin}/voice-interview/${data.id}`;
        
        // Send email invite
        await supabase.functions.invoke("send-candidate-invite", {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            candidateEmail: candidate.email,
            candidateName: candidate.name || null,
            jobRole: selectedJob.title,
            interviewId: data.id,
            interviewUrl,
            recruiterId: user.id
          }
        });

        let whatsappSent = false;
        
        // Send WhatsApp invite if enabled and phone number is provided
        if (sendWhatsApp && candidate.phone && candidate.phone.trim()) {
          try {
            await supabase.functions.invoke("send-whatsapp-invite", {
              headers: { Authorization: `Bearer ${accessToken}` },
              body: {
                candidatePhone: candidate.phone,
                candidateName: candidate.name || null,
                jobRole: selectedJob.title,
                interviewId: data.id,
                interviewUrl,
                recruiterId: user.id
              }
            });
            whatsappSent = true;
          } catch (whatsappErr) {
            console.error(`WhatsApp error for ${candidate.email}:`, whatsappErr);
          }
        }

        setInterviews(prev => [data as Interview, ...prev]);
        results.push({ email: candidate.email, success: true, whatsappSent });
      } catch (error: any) {
        console.error(`Error for ${candidate.email}:`, error);
        results.push({ email: candidate.email, success: false, error: error.message || "Failed" });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const whatsappCount = results.filter(r => r.whatsappSent).length;
    
    if (successCount > 0) {
      const whatsappMsg = whatsappCount > 0 ? ` (${whatsappCount} via WhatsApp)` : '';
      toast({
        title: "Bulk Invites Sent",
        description: `Successfully sent ${successCount} of ${candidates.length} invitations${whatsappMsg}.`
      });
    }

    return results;
  };

  const deleteJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from("jobs")
        .delete()
        .eq("id", jobId);

      if (error) throw error;
      
      setJobs(jobs.filter(j => j.id !== jobId));
      toast({ title: "Job deleted" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete job"
      });
    }
  };

  const copyJobLink = (job: Job) => {
    // Create a shareable link that could be used for applications
    const url = `${window.location.origin}/apply/${job.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Job application link copied to clipboard"
    });
  };

  const getJobCandidates = (jobId: string) => {
    return interviews.filter(i => i.job_id === jobId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-accent" />;
      case "in_progress":
        return <Clock className="w-4 h-4 text-primary" />;
      case "pending":
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-pulse text-muted-foreground">Loading jobs...</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-2xl border border-border">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Job Postings</h2>
            <p className="text-sm text-muted-foreground">Create jobs and manage candidates</p>
          </div>

          <Button variant="hero" onClick={() => setCreateJobOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Job
          </Button>
        </div>

        {jobs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No jobs yet</h3>
            <p className="text-muted-foreground mb-4">Create your first job posting to start organizing interviews</p>
            <Button variant="hero" onClick={() => setCreateJobOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Job
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => {
              const candidates = getJobCandidates(job.id);
              const isExpanded = expandedJobId === job.id;
              const completedCount = candidates.filter(c => c.status === "completed").length;
              const pendingCount = candidates.filter(c => c.status === "pending").length;

              return (
                <div key={job.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg gradient-bg flex items-center justify-center">
                          <Briefcase className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{job.title}</h3>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                            {job.department && (
                              <span className="flex items-center gap-1">
                                <Building className="w-3 h-3" />
                                {job.department}
                              </span>
                            )}
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {job.location}
                              </span>
                            )}
                            {job.salary_range && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {job.salary_range}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted">
                          <Users className="w-3 h-3" />
                          {candidates.length}
                        </span>
                        {completedCount > 0 && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/20 text-accent">
                            <CheckCircle className="w-3 h-3" />
                            {completedCount}
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/20 text-primary">
                            <Clock className="w-3 h-3" />
                            {pendingCount}
                          </span>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedJob(job);
                          setAddCandidateOpen(true);
                        }}
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Add
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedJob(job);
                          setBulkInviteOpen(true);
                        }}
                      >
                        <Mail className="w-4 h-4 mr-1" />
                        Bulk
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => copyJobLink(job)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => deleteJob(job.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded view with candidates */}
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 ml-13 pl-4 border-l-2 border-border"
                    >
                      {job.description && (
                        <p className="text-sm text-muted-foreground mb-4">{job.description}</p>
                      )}

                      {candidates.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-4">
                          No candidates yet. Add candidates individually or send bulk invites.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-foreground mb-2">
                            Candidates ({candidates.length})
                          </h4>
                          {candidates.map((candidate) => (
                            <div
                              key={candidate.id}
                              className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-primary-foreground text-xs font-semibold">
                                  {(candidate.candidate_name || candidate.candidate_email)
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-foreground text-sm">
                                    {candidate.candidate_name || candidate.candidate_email}
                                  </div>
                                  {candidate.candidate_name && (
                                    <div className="text-xs text-muted-foreground">
                                      {candidate.candidate_email}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {candidate.score !== null && (
                                  <span className="text-sm font-medium text-foreground">
                                    {candidate.score}/10
                                  </span>
                                )}
                                <div className="flex items-center gap-1">
                                  {getStatusIcon(candidate.status)}
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {candidate.status.replace("_", " ")}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    navigator.clipboard.writeText(
                                      `${window.location.origin}/voice-interview/${candidate.id}`
                                    );
                                    toast({ title: "Link copied" });
                                  }}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => window.open(`/voice-interview/${candidate.id}`, "_blank")}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateJobDialog
        open={createJobOpen}
        onOpenChange={setCreateJobOpen}
        onSubmit={handleCreateJob}
      />

      <AddCandidateToJobDialog
        open={addCandidateOpen}
        onOpenChange={setAddCandidateOpen}
        job={selectedJob}
        onSubmit={handleAddCandidate}
      />

      <JobBulkInviteDialog
        open={bulkInviteOpen}
        onOpenChange={setBulkInviteOpen}
        job={selectedJob}
        onSubmit={handleBulkInvite}
      />
    </>
  );
};

export default JobsTab;
