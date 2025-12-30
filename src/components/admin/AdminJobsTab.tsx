import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Trash2, Check, X, Clock, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Job {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  status: string;
  approval_status: string;
  rejection_reason: string | null;
  created_at: string;
  recruiter_id: string;
  recruiter_email?: string;
  recruiter_name?: string;
}

interface AdminJobsTabProps {
  onRefresh: () => void;
}

export const AdminJobsTab = ({ onRefresh }: AdminJobsTabProps) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const { toast } = useToast();

  const sendJobStatusEmail = async (job: Job, status: "approved" | "rejected", reason?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.functions.invoke("send-job-status-email", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: {
          jobId: job.id,
          jobTitle: job.title,
          recruiterId: job.recruiter_id,
          status,
          rejectionReason: reason
        }
      });
      console.log(`Job status email sent for ${job.title}`);
    } catch (error) {
      console.error("Failed to send job status email:", error);
      // Don't throw - email is secondary to the status update
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data: jobsData, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch recruiter profiles
      const recruiterIds = [...new Set(jobsData?.map(j => j.recruiter_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', recruiterIds);

      const jobsWithRecruiters = jobsData?.map(job => {
        const profile = profiles?.find(p => p.id === job.recruiter_id);
        const jobAny = job as any;
        return {
          ...job,
          approval_status: jobAny.approval_status || 'pending',
          rejection_reason: jobAny.rejection_reason || null,
          recruiter_email: profile?.email || 'N/A',
          recruiter_name: profile?.full_name || 'N/A'
        };
      }) || [];

      setJobs(jobsWithRecruiters);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch jobs"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveJob = async (job: Job) => {
    setSendingEmail(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ 
          approval_status: 'approved',
          approved_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) throw error;

      setJobs(prev => prev.map(j => 
        j.id === job.id ? { ...j, approval_status: 'approved' } : j
      ));

      // Send email notification
      await sendJobStatusEmail(job, 'approved');

      toast({
        title: "Job approved",
        description: "The job posting has been approved and the recruiter has been notified"
      });
      onRefresh();
    } catch (error) {
      console.error('Error approving job:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to approve job"
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleRejectJob = async () => {
    if (!selectedJob || !rejectionReason.trim()) return;
    setSendingEmail(true);

    try {
      const { error } = await supabase
        .from('jobs')
        .update({ 
          approval_status: 'rejected',
          rejection_reason: rejectionReason
        })
        .eq('id', selectedJob.id);

      if (error) throw error;

      setJobs(prev => prev.map(j => 
        j.id === selectedJob.id ? { ...j, approval_status: 'rejected', rejection_reason: rejectionReason } : j
      ));

      // Send email notification
      await sendJobStatusEmail(selectedJob, 'rejected', rejectionReason);

      toast({
        title: "Job rejected",
        description: "The job posting has been rejected and the recruiter has been notified"
      });
      
      setRejectDialogOpen(false);
      setSelectedJob(null);
      setRejectionReason("");
      onRefresh();
    } catch (error) {
      console.error('Error rejecting job:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to reject job"
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobId);

      if (error) throw error;

      setJobs(prev => prev.filter(j => j.id !== jobId));

      toast({
        title: "Job deleted",
        description: "The job posting has been removed"
      });
      onRefresh();
    } catch (error) {
      console.error('Error deleting job:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete job"
      });
    }
  };

  const filterJobs = (status: string) => {
    let filtered = jobs.filter(j => j.approval_status === status);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(j => 
        j.title.toLowerCase().includes(term) || 
        j.recruiter_name?.toLowerCase().includes(term) ||
        j.recruiter_email?.toLowerCase().includes(term)
      );
    }
    return filtered;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Rejected</Badge>;
      default:
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pending</Badge>;
    }
  };

  const renderJobsTable = (status: string) => {
    const filteredJobs = filterJobs(status);
    
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job Title</TableHead>
            <TableHead>Recruiter</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredJobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No {status} jobs found
              </TableCell>
            </TableRow>
          ) : (
            filteredJobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">{job.title}</TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{job.recruiter_name}</div>
                    <div className="text-sm text-muted-foreground">{job.recruiter_email}</div>
                  </div>
                </TableCell>
                <TableCell>{job.department || 'N/A'}</TableCell>
                <TableCell>{format(new Date(job.created_at), 'MMM d, yyyy')}</TableCell>
                <TableCell>{getStatusBadge(job.approval_status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {status === 'pending' && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-green-500 hover:text-green-600"
                          onClick={() => handleApproveJob(job)}
                          disabled={sendingEmail}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 hover:text-red-600"
                          onClick={() => {
                            setSelectedJob(job);
                            setRejectDialogOpen(true);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Job</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{job.title}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteJob(job.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Job Management</CardTitle>
              <CardDescription>Approve, reject, or remove job postings</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Button variant="outline" size="icon" onClick={fetchJobs}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                <Clock className="w-4 h-4" />
                Pending ({filterJobs('pending').length})
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-2">
                <Check className="w-4 h-4" />
                Approved ({filterJobs('approved').length})
              </TabsTrigger>
              <TabsTrigger value="rejected" className="gap-2">
                <X className="w-4 h-4" />
                Rejected ({filterJobs('rejected').length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                renderJobsTable('pending')
              )}
            </TabsContent>

            <TabsContent value="approved" className="mt-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                renderJobsTable('approved')
              )}
            </TabsContent>

            <TabsContent value="rejected" className="mt-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                renderJobsTable('rejected')
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Job Posting</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting "{selectedJob?.title}"
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRejectJob}
              disabled={!rejectionReason.trim()}
            >
              Reject Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
