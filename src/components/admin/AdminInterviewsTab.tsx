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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Trash2, RefreshCw, Eye, Play, CheckCircle, Clock, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Interview {
  id: string;
  job_role: string;
  candidate_name: string | null;
  candidate_email: string;
  status: string;
  score: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  recruiter_id: string;
  recruiter_name?: string;
  recruiter_email?: string;
}

interface AdminInterviewsTabProps {
  onRefresh: () => void;
}

export const AdminInterviewsTab = ({ onRefresh }: AdminInterviewsTabProps) => {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      const { data: interviewsData, error } = await supabase
        .from('interviews')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch recruiter profiles
      const recruiterIds = [...new Set(interviewsData?.map(i => i.recruiter_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', recruiterIds);

      const interviewsWithRecruiters = interviewsData?.map(interview => {
        const profile = profiles?.find(p => p.id === interview.recruiter_id);
        return {
          ...interview,
          recruiter_email: profile?.email || 'N/A',
          recruiter_name: profile?.full_name || 'N/A'
        };
      }) || [];

      setInterviews(interviewsWithRecruiters);
    } catch (error) {
      console.error('Error fetching interviews:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch interviews"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInterview = async (interviewId: string) => {
    try {
      const { error } = await supabase
        .from('interviews')
        .delete()
        .eq('id', interviewId);

      if (error) throw error;

      setInterviews(prev => prev.filter(i => i.id !== interviewId));

      toast({
        title: "Interview deleted",
        description: "The interview has been removed"
      });
      onRefresh();
    } catch (error) {
      console.error('Error deleting interview:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete interview"
      });
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
      case 'expired':
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 gap-1">
            <XCircle className="w-3 h-3" />
            Expired
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

  const filteredInterviews = interviews.filter(interview => {
    const matchesSearch = !searchTerm || 
      interview.candidate_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.candidate_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.job_role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.recruiter_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || interview.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: interviews.length,
    pending: interviews.filter(i => i.status === 'pending').length,
    in_progress: interviews.filter(i => i.status === 'in_progress').length,
    completed: interviews.filter(i => i.status === 'completed').length,
    expired: interviews.filter(i => i.status === 'expired').length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Interview Management</CardTitle>
            <CardDescription>View and manage all interviews across the platform</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search interviews..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                <SelectItem value="pending">Pending ({statusCounts.pending})</SelectItem>
                <SelectItem value="in_progress">In Progress ({statusCounts.in_progress})</SelectItem>
                <SelectItem value="completed">Completed ({statusCounts.completed})</SelectItem>
                <SelectItem value="expired">Expired ({statusCounts.expired})</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchInterviews}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job Role</TableHead>
                <TableHead>Recruiter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInterviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No interviews found
                  </TableCell>
                </TableRow>
              ) : (
                filteredInterviews.map((interview) => (
                  <TableRow key={interview.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{interview.candidate_name || 'N/A'}</div>
                        <div className="text-sm text-muted-foreground">{interview.candidate_email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{interview.job_role}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{interview.recruiter_name}</div>
                        <div className="text-sm text-muted-foreground">{interview.recruiter_email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(interview.status)}</TableCell>
                    <TableCell>
                      {interview.score !== null ? (
                        <Badge variant="outline" className="font-mono">
                          {interview.score}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(interview.created_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Interview</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this interview for {interview.candidate_name || interview.candidate_email}? 
                                This will also remove all interview messages and data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteInterview(interview.id)}
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
        )}
      </CardContent>
    </Card>
  );
};