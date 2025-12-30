import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CandidateFormFields, { CandidateFormData } from "@/components/CandidateFormFields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Mail,
  Phone,
  Download,
  Eye,
  Calendar,
  User,
  Briefcase,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Video,
  Play,
  Loader2,
  UserPlus,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { format } from "date-fns";

interface JobApplication {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  cover_letter: string | null;
  resume_url: string | null;
  notes: string | null;
  applied_at: string;
  updated_at: string;
  reviewed_at: string | null;
  jobs: {
    id: string;
    title: string;
    department: string | null;
    location: string | null;
  } | null;
  candidate_profiles: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    bio: string | null;
    skills: string[] | null;
    experience_years: number | null;
    linkedin_url: string | null;
    portfolio_url: string | null;
  } | null;
}

interface ApplicationsTabProps {
  user: SupabaseUser | null;
}

const statusOptions = [
  { value: "pending", label: "Pending Review", color: "bg-yellow-500/10 text-yellow-600 border-yellow-200" },
  { value: "reviewed", label: "Reviewed", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  { value: "shortlisted", label: "Shortlisted", color: "bg-green-500/10 text-green-600 border-green-200" },
  { value: "interview_scheduled", label: "Interview Scheduled", color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  { value: "rejected", label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-200" },
  { value: "hired", label: "Hired", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
];

const ApplicationsTab = ({ user }: ApplicationsTabProps) => {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterJob, setFilterJob] = useState<string>("all");
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [schedulingInterview, setSchedulingInterview] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [applicationToSchedule, setApplicationToSchedule] = useState<JobApplication | null>(null);
  const [candidateForm, setCandidateForm] = useState<CandidateFormData>({
    email: "",
    name: "",
    phone: ""
  });
  const { toast } = useToast();

  const fetchApplications = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // First, fetch applications with jobs (filtering by recruiter)
      const { data: appData, error: appError } = await supabase
        .from("job_applications")
        .select(`
          *,
          jobs!inner (
            id,
            title,
            department,
            location,
            recruiter_id
          )
        `)
        .eq("jobs.recruiter_id", user.id)
        .order("applied_at", { ascending: false });

      if (appError) throw appError;
      
      if (!appData || appData.length === 0) {
        setApplications([]);
        setJobs([]);
        setLoading(false);
        return;
      }

      // Get unique candidate IDs
      const candidateIds = [...new Set(appData.map(app => app.candidate_id))];
      
      // Fetch candidate profiles separately
      const { data: profilesData, error: profilesError } = await supabase
        .from("candidate_profiles")
        .select("user_id, full_name, email, phone, bio, skills, experience_years, linkedin_url, portfolio_url")
        .in("user_id", candidateIds);

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }

      // Create a map of candidate profiles
      const profilesMap = new Map(
        (profilesData || []).map(p => [p.user_id, p])
      );

      // Merge applications with candidate profiles
      const mergedData = appData.map(app => ({
        ...app,
        candidate_profiles: profilesMap.get(app.candidate_id) || null
      }));

      setApplications(mergedData as unknown as JobApplication[]);
      
      // Extract unique jobs for filter
      const uniqueJobs = Array.from(
        new Map(
          appData.map((app: any) => [app.jobs?.id, { id: app.jobs?.id, title: app.jobs?.title }])
        ).values()
      ).filter(job => job.id && job.title);
      setJobs(uniqueJobs);
    } catch (error: any) {
      console.error("Error fetching applications:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load applications",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [user]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("applications-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_applications",
        },
        () => {
          fetchApplications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const updateApplicationStatus = async (applicationId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("job_applications")
        .update({
          status: newStatus,
          reviewed_at: newStatus !== "pending" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: `Application status changed to ${statusOptions.find(s => s.value === newStatus)?.label}`,
      });

      // Update local state
      setApplications((prev) =>
        prev.map((app) =>
          app.id === applicationId
            ? { ...app, status: newStatus, updated_at: new Date().toISOString() }
            : app
        )
      );
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update application status",
      });
    }
  };

  const openScheduleDialog = (application: JobApplication) => {
    setApplicationToSchedule(application);
    setCandidateForm({
      email: application.candidate_profiles?.email || "",
      name: application.candidate_profiles?.full_name || "",
      phone: application.candidate_profiles?.phone || ""
    });
    setScheduleDialogOpen(true);
  };

  const scheduleInterview = async () => {
    if (!user || !applicationToSchedule) return;
    
    const { email, name, phone } = candidateForm;
    const jobTitle = applicationToSchedule.jobs?.title;
    
    if (!email || !name || !phone) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in all required fields",
      });
      return;
    }
    
    setSchedulingInterview(applicationToSchedule.id);
    
    try {
      // Create interview record
      const { data: interview, error: interviewError } = await supabase
        .from("interviews")
        .insert({
          recruiter_id: user.id,
          candidate_email: email,
          candidate_name: name,
          job_role: jobTitle || "Position",
          job_id: applicationToSchedule.job_id,
          status: "pending",
          time_limit_minutes: 30,
          candidate_resume_url: applicationToSchedule.resume_url || null,
        })
        .select()
        .single();

      if (interviewError) throw interviewError;

      const interviewUrl = `${window.location.origin}/voice-interview/${interview.id}`;
      
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      
      // Send email invite
      try {
        if (accessToken) {
          await supabase.functions.invoke("send-candidate-invite", {
            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            body: {
              candidateEmail: email,
              candidateName: name,
              jobRole: jobTitle || "Position",
              interviewId: interview.id,
              interviewUrl,
              recruiterId: user.id
            }
          });
        }
      } catch (emailError) {
        console.error("Failed to send email invitation:", emailError);
      }

      // Send WhatsApp invite
      try {
        if (accessToken) {
          await supabase.functions.invoke("send-whatsapp-invite", {
            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            body: {
              candidateName: name,
              candidatePhone: phone,
              jobRole: jobTitle || "Position",
              interviewId: interview.id,
              interviewUrl
            }
          });
        }
      } catch (whatsappError) {
        console.error("Failed to send WhatsApp invitation:", whatsappError);
      }

      // Remove the application from the list (moves to Interviews tab)
      setApplications((prev) => prev.filter((app) => app.id !== applicationToSchedule.id));
      
      // Close dialogs
      setScheduleDialogOpen(false);
      setDetailsOpen(false);
      setApplicationToSchedule(null);
      setCandidateForm({ email: "", name: "", phone: "" });

      toast({
        title: "Interview Scheduled",
        description: `AI interview created for ${name}. Invites sent via email and WhatsApp.`,
      });
    } catch (error: any) {
      console.error("Error scheduling interview:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to schedule interview. Please try again.",
      });
    } finally {
      setSchedulingInterview(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = statusOptions.find((s) => s.value === status) || statusOptions[0];
    return (
      <Badge variant="outline" className={statusConfig.color}>
        {statusConfig.label}
      </Badge>
    );
  };

  const openResumeUrl = async (resumeUrl: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("interview-documents")
        .createSignedUrl(resumeUrl, 60 * 60);

      if (error || !data?.signedUrl) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not access resume file",
        });
        return;
      }
      window.open(data.signedUrl, "_blank");
    } catch (error) {
      console.error("Error accessing resume:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to open resume",
      });
    }
  };

  const filteredApplications = applications.filter((app) => {
    if (filterStatus !== "all" && app.status !== filterStatus) return false;
    if (filterJob !== "all" && app.job_id !== filterJob) return false;
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4" />;
      case "reviewed":
        return <Eye className="w-4 h-4" />;
      case "shortlisted":
        return <CheckCircle className="w-4 h-4" />;
      case "interview_scheduled":
        return <Video className="w-4 h-4" />;
      case "rejected":
        return <XCircle className="w-4 h-4" />;
      case "hired":
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-muted-foreground">Loading applications...</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Job Applications</h2>
            <p className="text-sm text-muted-foreground">
              {applications.length} application{applications.length !== 1 ? "s" : ""} received
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Applications List */}
      {filteredApplications.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            {applications.length === 0 ? "No applications yet" : "No matching applications"}
          </h3>
          <p className="text-muted-foreground">
            {applications.length === 0
              ? "Applications will appear here when candidates apply to your jobs"
              : "Try adjusting your filters"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job Position</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApplications.map((application) => (
                <TableRow key={application.id} className="hover:bg-secondary/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-semibold text-sm">
                        {(application.candidate_profiles?.full_name || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {application.candidate_profiles?.full_name || "Unknown"}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {application.candidate_profiles?.email || "No email"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{application.jobs?.title}</span>
                    </div>
                    {application.jobs?.department && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {application.jobs.department}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(application.applied_at), "MMM d, yyyy")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={application.status}
                      onValueChange={(value) => updateApplicationStatus(application.id, value)}
                    >
                      <SelectTrigger className="w-[170px] h-8">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(application.status)}
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(status.value)}
                              {status.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(application.status === "shortlisted" || application.status === "reviewed") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openScheduleDialog(application)}
                          disabled={schedulingInterview === application.id}
                          title="Schedule AI Interview"
                          className="text-primary hover:text-primary"
                        >
                          {schedulingInterview === application.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      {application.resume_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openResumeUrl(application.resume_url!)}
                          title="View Resume"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedApplication(application);
                          setDetailsOpen(true);
                        }}
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Application Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Application Details
            </DialogTitle>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-6 mt-4">
              {/* Candidate Info */}
              <div className="p-4 bg-secondary/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Candidate Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Full Name</label>
                    <p className="font-medium">{selectedApplication.candidate_profiles?.full_name || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Email</label>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {selectedApplication.candidate_profiles?.email || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Phone</label>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedApplication.candidate_profiles?.phone || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Experience</label>
                    <p className="font-medium">
                      {selectedApplication.candidate_profiles?.experience_years
                        ? `${selectedApplication.candidate_profiles.experience_years} years`
                        : "N/A"}
                    </p>
                  </div>
                </div>
                {selectedApplication.candidate_profiles?.bio && (
                  <div className="mt-4">
                    <label className="text-sm text-muted-foreground">Bio</label>
                    <p className="text-sm mt-1">{selectedApplication.candidate_profiles.bio}</p>
                  </div>
                )}
                {selectedApplication.candidate_profiles?.skills && selectedApplication.candidate_profiles.skills.length > 0 && (
                  <div className="mt-4">
                    <label className="text-sm text-muted-foreground">Skills</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedApplication.candidate_profiles.skills.map((skill, i) => (
                        <Badge key={i} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  {selectedApplication.candidate_profiles?.linkedin_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedApplication.candidate_profiles?.linkedin_url!, "_blank")}
                    >
                      LinkedIn
                    </Button>
                  )}
                  {selectedApplication.candidate_profiles?.portfolio_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedApplication.candidate_profiles?.portfolio_url!, "_blank")}
                    >
                      Portfolio
                    </Button>
                  )}
                </div>
              </div>

              {/* Job Info */}
              <div className="p-4 bg-secondary/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Applied Position
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Job Title</label>
                    <p className="font-medium">{selectedApplication.jobs?.title}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Department</label>
                    <p className="font-medium">{selectedApplication.jobs?.department || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Location</label>
                    <p className="font-medium">{selectedApplication.jobs?.location || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Applied On</label>
                    <p className="font-medium">
                      {format(new Date(selectedApplication.applied_at), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cover Letter */}
              {selectedApplication.cover_letter && (
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Cover Letter
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{selectedApplication.cover_letter}</p>
                </div>
              )}

              {/* Resume */}
              {selectedApplication.resume_url && (
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Resume
                  </h3>
                  <Button
                    variant="outline"
                    onClick={() => openResumeUrl(selectedApplication.resume_url!)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Resume
                  </Button>
                </div>
              )}

              {/* Schedule Interview Button */}
              {(selectedApplication.status === "shortlisted" || selectedApplication.status === "reviewed") && (
                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Video className="w-4 h-4 text-primary" />
                    Schedule AI Interview
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create an AI-powered interview for this candidate. They will receive invitations via email and WhatsApp.
                  </p>
                  <Button
                    onClick={() => openScheduleDialog(selectedApplication)}
                    className="w-full"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Schedule Interview Now
                  </Button>
                </div>
              )}

              {selectedApplication.status === "interview_scheduled" && (
                <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-200">
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Video className="w-4 h-4 text-purple-600" />
                    Interview Scheduled
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    An AI interview has been scheduled for this candidate. Check the Interviews tab for details.
                  </p>
                </div>
              )}

              {/* Status Update */}
              <div className="p-4 bg-secondary/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-3">Update Status</h3>
                <Select
                  value={selectedApplication.status}
                  onValueChange={(value) => {
                    updateApplicationStatus(selectedApplication.id, value);
                    setSelectedApplication({ ...selectedApplication, status: value });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(status.value)}
                          {status.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule Interview Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Schedule Interview
            </DialogTitle>
            <DialogDescription>
              Add candidate details to schedule an interview for{" "}
              <strong>{applicationToSchedule?.jobs?.title || "this position"}</strong>
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              scheduleInterview();
            }}
            className="space-y-4 mt-4"
          >
            <CandidateFormFields
              formData={candidateForm}
              onChange={setCandidateForm}
              idPrefix="schedule"
              disabled={schedulingInterview !== null}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setScheduleDialogOpen(false);
                  setApplicationToSchedule(null);
                  setCandidateForm({ email: "", name: "", phone: "" });
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="hero"
                disabled={schedulingInterview !== null || !candidateForm.email || !candidateForm.name || !candidateForm.phone}
                className="flex-1"
              >
                {schedulingInterview ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  "Add & Send Invite"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApplicationsTab;
