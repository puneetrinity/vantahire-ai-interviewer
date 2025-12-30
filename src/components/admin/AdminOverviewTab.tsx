import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Users, 
  Briefcase, 
  FileText,
  TrendingUp,
  Clock,
  CheckCircle,
  Play,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface OverviewData {
  recentJobs: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    recruiter_name?: string;
  }>;
  recentInterviews: Array<{
    id: string;
    job_role: string;
    candidate_name: string | null;
    candidate_email: string;
    status: string;
    score: number | null;
    created_at: string;
  }>;
  recentCandidates: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    created_at: string;
  }>;
  stats: {
    totalJobs: number;
    activeJobs: number;
    totalInterviews: number;
    completedInterviews: number;
    totalCandidates: number;
    totalRecruiters: number;
  };
}

export const AdminOverviewTab = () => {
  const [data, setData] = useState<OverviewData>({
    recentJobs: [],
    recentInterviews: [],
    recentCandidates: [],
    stats: {
      totalJobs: 0,
      activeJobs: 0,
      totalInterviews: 0,
      completedInterviews: 0,
      totalCandidates: 0,
      totalRecruiters: 0,
    }
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      // Fetch recent jobs with recruiter info
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, title, status, created_at, recruiter_id')
        .order('created_at', { ascending: false })
        .limit(5);

      if (jobsError) throw jobsError;

      // Fetch recruiter profiles for jobs
      const recruiterIds = [...new Set(jobsData?.map(j => j.recruiter_id) || [])];
      const { data: recruiterProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', recruiterIds);

      const recentJobs = jobsData?.map(job => ({
        ...job,
        recruiter_name: recruiterProfiles?.find(p => p.id === job.recruiter_id)?.full_name || 'N/A'
      })) || [];

      // Fetch recent interviews
      const { data: interviewsData, error: interviewsError } = await supabase
        .from('interviews')
        .select('id, job_role, candidate_name, candidate_email, status, score, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (interviewsError) throw interviewsError;

      // Fetch recent candidates
      const { data: candidatesData, error: candidatesError } = await supabase
        .from('candidate_profiles')
        .select('id, full_name, email, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (candidatesError) throw candidatesError;

      // Fetch stats
      const { count: totalJobs } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true });

      const { count: activeJobs } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: totalInterviews } = await supabase
        .from('interviews')
        .select('*', { count: 'exact', head: true });

      const { count: completedInterviews } = await supabase
        .from('interviews')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      const { count: totalCandidates } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'candidate');

      const { count: totalRecruiters } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'recruiter');

      setData({
        recentJobs,
        recentInterviews: interviewsData || [],
        recentCandidates: candidatesData || [],
        stats: {
          totalJobs: totalJobs || 0,
          activeJobs: activeJobs || 0,
          totalInterviews: totalInterviews || 0,
          completedInterviews: completedInterviews || 0,
          totalCandidates: totalCandidates || 0,
          totalRecruiters: totalRecruiters || 0,
        }
      });
    } catch (error) {
      console.error('Error fetching overview data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch overview data"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1">
            <CheckCircle className="w-3 h-3" />
            Completed
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1">
            <Play className="w-3 h-3" />
            In Progress
          </Badge>
        );
      case 'active':
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            Active
          </Badge>
        );
      case 'closed':
        return (
          <Badge className="bg-muted text-muted-foreground border-muted">
            Closed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading overview...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total Jobs</span>
            </div>
            <p className="text-2xl font-bold mt-1">{data.stats.totalJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active Jobs</span>
            </div>
            <p className="text-2xl font-bold mt-1">{data.stats.activeJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Interviews</span>
            </div>
            <p className="text-2xl font-bold mt-1">{data.stats.totalInterviews}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold mt-1">{data.stats.completedInterviews}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Candidates</span>
            </div>
            <p className="text-2xl font-bold mt-1">{data.stats.totalCandidates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Recruiters</span>
            </div>
            <p className="text-2xl font-bold mt-1">{data.stats.totalRecruiters}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Data Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Jobs</CardTitle>
                <CardDescription>Latest job postings</CardDescription>
              </div>
              <Briefcase className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Recruiter</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                        No jobs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium truncate max-w-[150px]">{job.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(job.created_at), 'MMM d')}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{job.recruiter_name}</TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Interviews */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Interviews</CardTitle>
                <CardDescription>Latest interview sessions</CardDescription>
              </div>
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentInterviews.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                        No interviews found
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentInterviews.map((interview) => (
                      <TableRow key={interview.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium truncate max-w-[120px]">
                              {interview.candidate_name || 'N/A'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {interview.candidate_email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[100px]">{interview.job_role}</TableCell>
                        <TableCell>{getStatusBadge(interview.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Recent Candidates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Candidates</CardTitle>
              <CardDescription>Newly registered candidates</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchOverviewData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                    No candidates found
                  </TableCell>
                </TableRow>
              ) : (
                data.recentCandidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="font-medium">{candidate.full_name || 'N/A'}</TableCell>
                    <TableCell>{candidate.email || 'N/A'}</TableCell>
                    <TableCell>{format(new Date(candidate.created_at), 'MMM d, yyyy')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};