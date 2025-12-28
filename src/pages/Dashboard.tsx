import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Zap,
  Plus,
  LogOut,
  Users,
  Clock,
  TrendingUp,
  Play,
  MoreHorizontal,
  Copy,
  ExternalLink,
  Trash2
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface Interview {
  id: string;
  candidate_email: string;
  candidate_name: string | null;
  job_role: string;
  status: string;
  score: number | null;
  created_at: string;
  completed_at: string | null;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newInterview, setNewInterview] = useState({
    candidateEmail: "",
    candidateName: "",
    jobRole: ""
  });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        fetchInterviews();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchInterviews = async () => {
    try {
      const { data, error } = await supabase
        .from("interviews")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInterviews(data || []);
    } catch (error: any) {
      console.error("Error fetching interviews:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load interviews"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleCreateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

    try {
      const { data, error } = await supabase
        .from("interviews")
        .insert({
          recruiter_id: user.id,
          candidate_email: newInterview.candidateEmail,
          candidate_name: newInterview.candidateName || null,
          job_role: newInterview.jobRole,
          status: "pending"
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Interview Created",
        description: "Share the interview link with your candidate."
      });

      setInterviews([data, ...interviews]);
      setCreateDialogOpen(false);
      setNewInterview({ candidateEmail: "", candidateName: "", jobRole: "" });
    } catch (error: any) {
      console.error("Error creating interview:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create interview"
      });
    } finally {
      setCreating(false);
    }
  };

  const copyInterviewLink = (id: string) => {
    const url = `${window.location.origin}/interview/${id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Interview link copied to clipboard"
    });
  };

  const deleteInterview = async (id: string) => {
    try {
      const { error } = await supabase
        .from("interviews")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setInterviews(interviews.filter(i => i.id !== id));
      toast({ title: "Interview deleted" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete interview"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-accent/20 text-accent";
      case "in_progress": return "bg-primary/20 text-primary";
      case "pending": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const stats = {
    total: interviews.length,
    completed: interviews.filter(i => i.status === "completed").length,
    pending: interviews.filter(i => i.status === "pending").length,
    avgScore: interviews.filter(i => i.score).reduce((acc, i) => acc + (i.score || 0), 0) / 
              (interviews.filter(i => i.score).length || 1)
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-bg flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">InterviewAI</span>
          </a>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Interviews", value: stats.total, icon: Users },
            { label: "Completed", value: stats.completed, icon: TrendingUp },
            { label: "Pending", value: stats.pending, icon: Clock },
            { label: "Avg Score", value: stats.avgScore.toFixed(1), icon: Play },
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 rounded-xl bg-card border border-border"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Interviews List */}
        <div className="bg-card rounded-2xl border border-border">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Interviews</h2>
              <p className="text-sm text-muted-foreground">Manage your candidate interviews</p>
            </div>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="hero">
                  <Plus className="w-4 h-4 mr-2" />
                  New Interview
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Interview</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateInterview} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="candidateEmail">Candidate Email *</Label>
                    <Input
                      id="candidateEmail"
                      type="email"
                      placeholder="candidate@email.com"
                      value={newInterview.candidateEmail}
                      onChange={(e) => setNewInterview({...newInterview, candidateEmail: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="candidateName">Candidate Name</Label>
                    <Input
                      id="candidateName"
                      type="text"
                      placeholder="John Doe"
                      value={newInterview.candidateName}
                      onChange={(e) => setNewInterview({...newInterview, candidateName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobRole">Job Role *</Label>
                    <Input
                      id="jobRole"
                      type="text"
                      placeholder="Senior Software Engineer"
                      value={newInterview.jobRole}
                      onChange={(e) => setNewInterview({...newInterview, jobRole: e.target.value})}
                      required
                    />
                  </div>
                  <Button type="submit" variant="hero" className="w-full" disabled={creating}>
                    {creating ? "Creating..." : "Create Interview"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {interviews.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No interviews yet</h3>
              <p className="text-muted-foreground mb-4">Create your first interview to get started</p>
              <Button variant="hero" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Interview
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="p-4 hover:bg-secondary/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-semibold">
                      {(interview.candidate_name || interview.candidate_email)
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        {interview.candidate_name || interview.candidate_email}
                      </div>
                      <div className="text-sm text-muted-foreground">{interview.job_role}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {interview.score !== null && (
                      <div className="text-right">
                        <div className="font-semibold text-foreground">{interview.score}/10</div>
                        <div className="text-xs text-muted-foreground">Score</div>
                      </div>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(interview.status)}`}>
                      {interview.status.replace("_", " ")}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyInterviewLink(interview.id)}
                        title="Copy link"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(`/interview/${interview.id}`, "_blank")}
                        title="Open interview"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteInterview(interview.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
