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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Trash2, UserCheck, UserX, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface User {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
  full_name?: string;
}

interface AdminUsersTabProps {
  onRefresh: () => void;
}

export const AdminUsersTab = ({ onRefresh }: AdminUsersTabProps) => {
  const [recruiters, setRecruiters] = useState<User[]>([]);
  const [candidates, setCandidates] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch recruiters with profiles
      const { data: recruiterRoles, error: recruiterError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('role', 'recruiter');

      if (recruiterError) throw recruiterError;

      // Fetch recruiter profiles
      const recruiterIds = recruiterRoles?.map(r => r.user_id) || [];
      const { data: recruiterProfiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', recruiterIds);

      const recruitersWithProfiles = recruiterRoles?.map(role => {
        const profile = recruiterProfiles?.find(p => p.id === role.user_id);
        return {
          ...role,
          email: profile?.email || 'N/A',
          full_name: profile?.full_name || 'N/A'
        };
      }) || [];

      setRecruiters(recruitersWithProfiles);

      // Fetch candidates with profiles
      const { data: candidateRoles, error: candidateError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('role', 'candidate');

      if (candidateError) throw candidateError;

      const candidateIds = candidateRoles?.map(r => r.user_id) || [];
      const { data: candidateProfiles } = await supabase
        .from('candidate_profiles')
        .select('user_id, email, full_name')
        .in('user_id', candidateIds);

      const candidatesWithProfiles = candidateRoles?.map(role => {
        const profile = candidateProfiles?.find(p => p.user_id === role.user_id);
        return {
          ...role,
          email: profile?.email || 'N/A',
          full_name: profile?.full_name || 'N/A'
        };
      }) || [];

      setCandidates(candidatesWithProfiles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch users"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, role: string) => {
    try {
      // Delete user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (roleError) throw roleError;

      // Delete associated profile
      if (role === 'recruiter') {
        await supabase.from('profiles').delete().eq('id', userId);
        setRecruiters(prev => prev.filter(r => r.user_id !== userId));
      } else {
        await supabase.from('candidate_profiles').delete().eq('user_id', userId);
        setCandidates(prev => prev.filter(c => c.user_id !== userId));
      }

      toast({
        title: "User deleted",
        description: "The user has been removed from the system"
      });
      onRefresh();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete user"
      });
    }
  };

  const filterUsers = (users: User[]) => {
    if (!searchTerm) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(u => 
      u.email?.toLowerCase().includes(term) || 
      u.full_name?.toLowerCase().includes(term)
    );
  };

  const renderUserTable = (users: User[], role: string) => (
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
              <TableCell className="font-medium">{user.full_name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                {format(new Date(user.created_at), 'MMM d, yyyy')}
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
                        Are you sure you want to delete {user.full_name}? This action cannot be undone
                        and will remove all associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteUser(user.user_id, role)}
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
            <Button variant="outline" size="icon" onClick={fetchUsers}>
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
