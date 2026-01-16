import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { admin as adminApi, interviews as interviewsApi, type Interview } from "@/lib/api";
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
import { Search, Trash2, RefreshCw, Play, CheckCircle, Clock, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AdminInterviewsTabProps {
  onRefresh: () => void;
}

export const AdminInterviewsTab = ({ onRefresh }: AdminInterviewsTabProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  // Fetch all interviews
  const { data: interviewsData, isLoading, refetch: refetchInterviews } = useQuery({
    queryKey: ["admin-interviews"],
    queryFn: () => adminApi.listInterviews({ limit: 100 }),
  });

  const interviews = interviewsData?.data || [];

  // Delete interview mutation
  const deleteInterviewMutation = useMutation({
    mutationFn: (interviewId: string) => interviewsApi.delete(interviewId),
    onSuccess: () => {
      toast({
        title: "Interview deleted",
        description: "The interview has been removed"
      });
      refetchInterviews();
      onRefresh();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete interview"
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1">
            <CheckCircle className="w-3 h-3" />
            Completed
          </Badge>
        );
      case 'IN_PROGRESS':
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1">
            <Play className="w-3 h-3" />
            In Progress
          </Badge>
        );
      case 'EXPIRED':
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
      interview.candidateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.candidateEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.jobRole?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interview.recruiter?.fullName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" ||
      interview.status?.toUpperCase() === statusFilter.toUpperCase();

    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: interviews.length,
    PENDING: interviews.filter(i => i.status === 'PENDING').length,
    IN_PROGRESS: interviews.filter(i => i.status === 'IN_PROGRESS').length,
    COMPLETED: interviews.filter(i => i.status === 'COMPLETED').length,
    EXPIRED: interviews.filter(i => i.status === 'EXPIRED').length,
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
                <SelectItem value="PENDING">Pending ({statusCounts.PENDING})</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress ({statusCounts.IN_PROGRESS})</SelectItem>
                <SelectItem value="COMPLETED">Completed ({statusCounts.COMPLETED})</SelectItem>
                <SelectItem value="EXPIRED">Expired ({statusCounts.EXPIRED})</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetchInterviews()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
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
                        <div className="font-medium">{interview.candidateName || 'N/A'}</div>
                        <div className="text-sm text-muted-foreground">{interview.candidateEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{interview.jobRole}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{interview.recruiter?.fullName || 'N/A'}</div>
                        <div className="text-sm text-muted-foreground">{interview.recruiter?.email || 'N/A'}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(interview.status)}</TableCell>
                    <TableCell>
                      {interview.score !== null ? (
                        <Badge variant="outline" className="font-mono">
                          {Math.round(interview.score * 100)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(interview.createdAt), 'MMM d, yyyy')}</TableCell>
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
                                Are you sure you want to delete this interview for {interview.candidateName || interview.candidateEmail}?
                                This will also remove all interview messages and data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteInterviewMutation.mutate(interview.id)}
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
