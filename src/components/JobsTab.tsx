import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  jobs as jobsApi,
  interviews as interviewsApi,
  type Job,
  type Interview,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
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
  RefreshCw,
  MessageCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LocalInterview {
  id: string;
  candidateEmail: string;
  candidateName: string | null;
  jobRole: string;
  status: string;
  score: number | null;
  createdAt: string;
  jobId: string | null;
}

interface ResendingState {
  [key: string]: { email: boolean; whatsapp: boolean };
}

const JobsTab = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [interviews, setInterviews] = useState<LocalInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [resending, setResending] = useState<ResendingState>({});
  const { toast } = useToast();

  const fetchJobs = useCallback(async () => {
    try {
      const response = await jobsApi.list({ limit: 100 });
      setJobs(response.data);
    } catch (error: unknown) {
      console.error("Error fetching jobs:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load jobs"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchInterviews = useCallback(async () => {
    try {
      const response = await interviewsApi.list({ limit: 500 });
      setInterviews(response.data.map(i => ({
        id: i.id,
        candidateEmail: i.candidateEmail,
        candidateName: i.candidateName,
        jobRole: i.jobRole,
        status: i.status.toLowerCase(),
        score: i.score,
        createdAt: i.createdAt,
        jobId: i.jobId,
      })));
    } catch (error: unknown) {
      console.error("Error fetching interviews:", error);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchInterviews();
    }
  }, [user, fetchJobs, fetchInterviews]);

  const handleCreateJob = async (jobData: {
    title: string;
    description: string;
    department: string;
    salary_range: string;
    location: string;
    job_type: string;
  }) => {
    if (!user) return;

    const newJob = await jobsApi.create({
      title: jobData.title,
      description: jobData.description || undefined,
      department: jobData.department || undefined,
      salaryRange: jobData.salary_range || undefined,
      location: jobData.location || undefined,
      jobType: jobData.job_type
    });

    setJobs([newJob, ...jobs]);
    toast({
      title: "Job Created",
      description: `${jobData.title} has been created successfully.`
    });
  };

  const handleAddCandidate = async (candidate: { email: string; name: string; phone?: string }) => {
    if (!user || !selectedJob) return;

    // Create interview linked to job
    const interview = await interviewsApi.create({
      candidateEmail: candidate.email,
      candidateName: candidate.name || undefined,
      candidatePhone: candidate.phone || undefined,
      jobRole: selectedJob.title,
      jobId: selectedJob.id,
      timeLimitMinutes: 30
    });

    // Send email invite
    try {
      await interviewsApi.sendEmailInvite(interview.id);

      // Send WhatsApp invite if phone number is provided
      if (candidate.phone && candidate.phone.trim()) {
        try {
          await interviewsApi.sendWhatsAppInvite(interview.id, candidate.phone);
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

    setInterviews([{
      id: interview.id,
      candidateEmail: interview.candidateEmail,
      candidateName: interview.candidateName,
      jobRole: interview.jobRole,
      status: interview.status.toLowerCase(),
      score: interview.score,
      createdAt: interview.createdAt,
      jobId: interview.jobId,
    }, ...interviews]);
  };

  const handleBulkInvite = async (candidates: { email: string; name: string; phone?: string }[], sendWhatsApp: boolean) => {
    if (!user || !selectedJob) return [];

    const results: { email: string; success: boolean; error?: string; whatsappSent?: boolean }[] = [];

    for (const candidate of candidates) {
      try {
        const interview = await interviewsApi.create({
          candidateEmail: candidate.email,
          candidateName: candidate.name || undefined,
          candidatePhone: candidate.phone || undefined,
          jobRole: selectedJob.title,
          jobId: selectedJob.id,
          timeLimitMinutes: 30
        });

        // Send email invite
        await interviewsApi.sendEmailInvite(interview.id);

        let whatsappSent = false;

        // Send WhatsApp invite if enabled and phone number is provided
        if (sendWhatsApp && candidate.phone && candidate.phone.trim()) {
          try {
            await interviewsApi.sendWhatsAppInvite(interview.id, candidate.phone);
            whatsappSent = true;
          } catch (whatsappErr) {
            console.error(`WhatsApp error for ${candidate.email}:`, whatsappErr);
          }
        }

        setInterviews(prev => [{
          id: interview.id,
          candidateEmail: interview.candidateEmail,
          candidateName: interview.candidateName,
          jobRole: interview.jobRole,
          status: interview.status.toLowerCase(),
          score: interview.score,
          createdAt: interview.createdAt,
          jobId: interview.jobId,
        }, ...prev]);
        results.push({ email: candidate.email, success: true, whatsappSent });
      } catch (error: unknown) {
        console.error(`Error for ${candidate.email}:`, error);
        results.push({ email: candidate.email, success: false, error: error instanceof Error ? error.message : "Failed" });
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

  const resendEmailInvite = async (interview: LocalInterview) => {
    if (!user) return;

    setResending(prev => ({
      ...prev,
      [interview.id]: { ...prev[interview.id], email: true }
    }));

    try {
      await interviewsApi.sendEmailInvite(interview.id);

      toast({
        title: "Email Sent",
        description: `Interview invitation resent to ${interview.candidateEmail}`
      });
    } catch (error: unknown) {
      console.error("Resend email error:", error);
      toast({
        variant: "destructive",
        title: "Failed to Send",
        description: error instanceof Error ? error.message : "Could not resend email invitation"
      });
    } finally {
      setResending(prev => ({
        ...prev,
        [interview.id]: { ...prev[interview.id], email: false }
      }));
    }
  };

  const resendWhatsAppInvite = async (interview: LocalInterview, phone: string) => {
    if (!user) return;

    setResending(prev => ({
      ...prev,
      [interview.id]: { ...prev[interview.id], whatsapp: true }
    }));

    try {
      await interviewsApi.sendWhatsAppInvite(interview.id, phone);

      toast({
        title: "WhatsApp Sent",
        description: `Interview invitation resent via WhatsApp`
      });
    } catch (error: unknown) {
      console.error("Resend WhatsApp error:", error);
      toast({
        variant: "destructive",
        title: "Failed to Send",
        description: error instanceof Error ? error.message : "Could not resend WhatsApp invitation"
      });
    } finally {
      setResending(prev => ({
        ...prev,
        [interview.id]: { ...prev[interview.id], whatsapp: false }
      }));
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      await jobsApi.delete(jobId);

      setJobs(jobs.filter(j => j.id !== jobId));
      toast({ title: "Job deleted" });
    } catch (error: unknown) {
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
    return interviews.filter(i => i.jobId === jobId);
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

          <Button variant="hero" onClick={() => setCreateJobOpen(true)} data-tour="create-job">
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
                <div key={job.id} className="p-4" data-tour={jobs.indexOf(job) === 0 ? "job-card" : undefined}>
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
                            {job.salaryRange && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {job.salaryRange}
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
                        data-tour={jobs.indexOf(job) === 0 ? "add-candidate-btn" : undefined}
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
                        data-tour={jobs.indexOf(job) === 0 ? "bulk-invite-btn" : undefined}
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
                                  {(candidate.candidateName || candidate.candidateEmail)
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-foreground text-sm">
                                    {candidate.candidateName || candidate.candidateEmail}
                                  </div>
                                  {candidate.candidateName && (
                                    <div className="text-xs text-muted-foreground">
                                      {candidate.candidateEmail}
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

                                {/* Resend Invite Dropdown */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={resending[candidate.id]?.email || resending[candidate.id]?.whatsapp}
                                      data-tour="resend-actions"
                                    >
                                      {resending[candidate.id]?.email || resending[candidate.id]?.whatsapp ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="w-3 h-3" />
                                      )}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => resendEmailInvite(candidate)}
                                      disabled={resending[candidate.id]?.email}
                                    >
                                      <Mail className="w-4 h-4 mr-2" />
                                      Resend Email
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        const phone = prompt("Enter WhatsApp number (with country code):");
                                        if (phone && phone.trim()) {
                                          resendWhatsAppInvite(candidate, phone.trim());
                                        }
                                      }}
                                      disabled={resending[candidate.id]?.whatsapp}
                                    >
                                      <MessageCircle className="w-4 h-4 mr-2" />
                                      Resend WhatsApp
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
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
        existingCandidates={selectedJob ? getJobCandidates(selectedJob.id).map(c => ({
          email: c.candidateEmail,
          name: c.candidateName,
          status: c.status
        })) : []}
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
