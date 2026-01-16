import { useEffect, useState, useCallback } from "react";
import {
  applications as applicationsApi,
  interviews as interviewsApi,
  files as filesApi,
  type ApplicationWithDetails,
} from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
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
import { format } from "date-fns";

const statusOptions = [
  { value: "PENDING", label: "Pending Review", color: "bg-yellow-500/10 text-yellow-600 border-yellow-200" },
  { value: "REVIEWED", label: "Reviewed", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  { value: "SHORTLISTED", label: "Shortlisted", color: "bg-green-500/10 text-green-600 border-green-200" },
  { value: "INTERVIEW_SCHEDULED", label: "Interview Scheduled", color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  { value: "REJECTED", label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-200" },
  { value: "HIRED", label: "Hired", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
];

const ApplicationsTab = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterJob, setFilterJob] = useState<string>("all");
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [schedulingInterview, setSchedulingInterview] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [applicationToSchedule, setApplicationToSchedule] = useState<ApplicationWithDetails | null>(null);
  const [candidateForm, setCandidateForm] = useState<CandidateFormData>({
    email: "",
    name: "",
    phone: ""
  });
  const { toast } = useToast();
  const { socket } = useSocket();

  const fetchApplications = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await applicationsApi.list({ limit: 100 });
      setApplications(response.data);

      // Extract unique jobs for filter
      const uniqueJobs = Array.from(
        new Map(
          response.data
            .filter(app => app.job)
            .map(app => [app.job!.id, { id: app.job!.id, title: app.job!.title }])
        ).values()
      );
      setJobs(uniqueJobs);
    } catch (error: unknown) {
      console.error("Error fetching applications:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load applications",
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Listen for realtime updates via socket.io
  useEffect(() => {
    if (!socket) return;

    const handleApplicationUpdate = () => {
      fetchApplications();
    };

    socket.on("application:created", handleApplicationUpdate);
    socket.on("application:updated", handleApplicationUpdate);
    socket.on("application:deleted", handleApplicationUpdate);

    return () => {
      socket.off("application:created", handleApplicationUpdate);
      socket.off("application:updated", handleApplicationUpdate);
      socket.off("application:deleted", handleApplicationUpdate);
    };
  }, [socket, fetchApplications]);

  const updateApplicationStatus = async (applicationId: string, newStatus: string) => {
    try {
      await applicationsApi.updateStatus(applicationId, newStatus as ApplicationWithDetails['status']);

      toast({
        title: "Status Updated",
        description: `Application status changed to ${statusOptions.find(s => s.value === newStatus)?.label}`,
      });

      // Update local state
      setApplications((prev) =>
        prev.map((app) =>
          app.id === applicationId
            ? { ...app, status: newStatus as ApplicationWithDetails['status'], updatedAt: new Date().toISOString() }
            : app
        )
      );
    } catch (error: unknown) {
      console.error("Error updating status:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update application status",
      });
    }
  };

  const openScheduleDialog = (application: ApplicationWithDetails) => {
    setApplicationToSchedule(application);
    setCandidateForm({
      email: application.candidate?.email || "",
      name: application.candidate?.fullName || "",
      phone: application.candidate?.phone || ""
    });
    setScheduleDialogOpen(true);
  };

  const scheduleInterview = async () => {
    if (!user || !applicationToSchedule) return;

    const { email, name, phone } = candidateForm;
    const jobTitle = applicationToSchedule.job?.title;

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
      const interview = await interviewsApi.create({
        candidateEmail: email,
        candidateName: name,
        candidatePhone: phone,
        jobRole: jobTitle || "Position",
        jobId: applicationToSchedule.jobId,
        timeLimitMinutes: 30,
        candidateResumeFileId: applicationToSchedule.resumeFileId || undefined,
      });

      // Send email invite
      try {
        await interviewsApi.sendEmailInvite(interview.id);
      } catch (emailError) {
        console.error("Failed to send email invitation:", emailError);
      }

      // Send WhatsApp invite
      try {
        await interviewsApi.sendWhatsAppInvite(interview.id, phone);
      } catch (whatsappError) {
        console.error("Failed to send WhatsApp invitation:", whatsappError);
      }

      // Update the application status to interview_scheduled
      await applicationsApi.updateStatus(applicationToSchedule.id, 'SHORTLISTED');

      // Update local state
      setApplications((prev) =>
        prev.map((app) =>
          app.id === applicationToSchedule.id
            ? { ...app, status: 'SHORTLISTED' as const }
            : app
        )
      );

      // Close dialogs
      setScheduleDialogOpen(false);
      setDetailsOpen(false);
      setApplicationToSchedule(null);
      setCandidateForm({ email: "", name: "", phone: "" });

      toast({
        title: "Interview Scheduled",
        description: `AI interview created for ${name}. Invites sent via email and WhatsApp.`,
      });
    } catch (error: unknown) {
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

  const openResumeUrl = async (resumeFileId: string) => {
    try {
      const { signedUrl } = await filesApi.getSignedUrl(resumeFileId, 3600);
      window.open(signedUrl, "_blank");
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
    if (filterJob !== "all" && app.jobId !== filterJob) return false;
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Clock className="w-4 h-4" />;
      case "REVIEWED":
        return <Eye className="w-4 h-4" />;
      case "SHORTLISTED":
        return <CheckCircle className="w-4 h-4" />;
      case "INTERVIEW_SCHEDULED":
        return <Video className="w-4 h-4" />;
      case "REJECTED":
        return <XCircle className="w-4 h-4" />;
      case "HIRED":
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
                        {(application.candidate?.fullName || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {application.candidate?.fullName || "Unknown"}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {application.candidate?.email || "No email"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{application.job?.title}</span>
                    </div>
                    {application.job?.department && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {application.job.department}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(application.appliedAt), "MMM d, yyyy")}
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
                      {(application.status === "SHORTLISTED" || application.status === "REVIEWED") && (
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
                      {application.resumeFileId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openResumeUrl(application.resumeFileId!)}
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
                    <p className="font-medium">{selectedApplication.candidate?.fullName || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Email</label>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {selectedApplication.candidate?.email || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Phone</label>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedApplication.candidate?.phone || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Experience</label>
                    <p className="font-medium">
                      {selectedApplication.candidate?.experienceYears
                        ? `${selectedApplication.candidate.experienceYears} years`
                        : "N/A"}
                    </p>
                  </div>
                </div>
                {selectedApplication.candidate?.bio && (
                  <div className="mt-4">
                    <label className="text-sm text-muted-foreground">Bio</label>
                    <p className="text-sm mt-1">{selectedApplication.candidate.bio}</p>
                  </div>
                )}
                {selectedApplication.candidate?.skills && selectedApplication.candidate.skills.length > 0 && (
                  <div className="mt-4">
                    <label className="text-sm text-muted-foreground">Skills</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedApplication.candidate.skills.map((skill, i) => (
                        <Badge key={i} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  {selectedApplication.candidate?.linkedinUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedApplication.candidate?.linkedinUrl!, "_blank")}
                    >
                      LinkedIn
                    </Button>
                  )}
                  {selectedApplication.candidate?.portfolioUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedApplication.candidate?.portfolioUrl!, "_blank")}
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
                    <p className="font-medium">{selectedApplication.job?.title}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Department</label>
                    <p className="font-medium">{selectedApplication.job?.department || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Location</label>
                    <p className="font-medium">{selectedApplication.job?.location || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Applied On</label>
                    <p className="font-medium">
                      {format(new Date(selectedApplication.appliedAt), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cover Letter */}
              {selectedApplication.coverLetter && (
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Cover Letter
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{selectedApplication.coverLetter}</p>
                </div>
              )}

              {/* Resume */}
              {selectedApplication.resumeFileId && (
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Resume
                  </h3>
                  <Button
                    variant="outline"
                    onClick={() => openResumeUrl(selectedApplication.resumeFileId!)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Resume
                  </Button>
                </div>
              )}

              {/* Schedule Interview Button */}
              {(selectedApplication.status === "SHORTLISTED" || selectedApplication.status === "REVIEWED") && (
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

              {selectedApplication.status === "INTERVIEW_SCHEDULED" && (
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
                    setSelectedApplication({ ...selectedApplication, status: value as ApplicationWithDetails['status'] });
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
              <strong>{applicationToSchedule?.job?.title || "this position"}</strong>
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
