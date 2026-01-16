import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { admin as adminApi, type AdminUser } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Trash2, UserCheck, UserX, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AdminUsersTabProps {
  onRefresh: () => void;
}

export const AdminUsersTab = ({ onRefresh }: AdminUsersTabProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch recruiters
  const { data: recruitersData, isLoading: recruitersLoading, refetch: refetchRecruiters } = useQuery({
    queryKey: ["admin-users", "RECRUITER"],
    queryFn: () => adminApi.listUsers({ role: "RECRUITER", limit: 100 }),
  });

  // Fetch candidates
  const { data: candidatesData, isLoading: candidatesLoading, refetch: refetchCandidates } = useQuery({
    queryKey: ["admin-users", "CANDIDATE"],
    queryFn: () => adminApi.listUsers({ role: "CANDIDATE", limit: 100 }),
  });

  const recruiters = recruitersData?.data || [];
  const candidates = candidatesData?.data || [];

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: () => {
      toast({
        title: "User deleted",
        description: "The user has been removed from the system"
      });
      refetchRecruiters();
      refetchCandidates();
      onRefresh();
    },
    onError: (error: any) => {
      console.error('Error deleting user:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete user"
      });
    },
  });

  const handleRefresh = () => {
    refetchRecruiters();
    refetchCandidates();
  };

  const filterUsers = (users: AdminUser[]) => {
    if (!searchTerm) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(u =>
      u.email?.toLowerCase().includes(term) ||
      u.fullName?.toLowerCase().includes(term)
    );
  };

  const renderUserTable = (users: AdminUser[], role: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filterUsers(users).length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
              No {role}s found
            </TableCell>
          </TableRow>
        ) : (
          filterUsers(users).map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.fullName || 'N/A'}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                {format(new Date(user.createdAt), 'MMM d, yyyy')}
              </TableCell>
              <TableCell className="text-right">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete User</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete {user.fullName || user.email}? This action cannot be undone
                        and will remove all associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteUserMutation.mutate(user.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const loading = recruitersLoading || candidatesLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>View and manage all users on the platform</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button variant="outline" size="icon" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="recruiters">
          <TabsList>
            <TabsTrigger value="recruiters" className="gap-2">
              <UserCheck className="w-4 h-4" />
              Recruiters ({recruiters.length})
            </TabsTrigger>
            <TabsTrigger value="candidates" className="gap-2">
              <UserX className="w-4 h-4" />
              Candidates ({candidates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recruiters" className="mt-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              renderUserTable(recruiters, 'recruiter')
            )}
          </TabsContent>

          <TabsContent value="candidates" className="mt-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              renderUserTable(candidates, 'candidate')
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
