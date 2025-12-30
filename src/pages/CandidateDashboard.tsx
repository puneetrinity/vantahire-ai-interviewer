import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  User, 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  LogOut,
  ExternalLink,
  Calendar,
  Award,
  Briefcase,
  Building2,
  MapPin,
  Send,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";

interface Interview {
  id: string;
  job_role: string;
  status: string;
  score: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

interface CandidateProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  bio: string | null;
  skills: string[] | null;
  experience_years: number | null;
}

interface JobApplication {
  id: string;
  job_id: string;
  status: string;
  cover_letter: string | null;
  applied_at: string;
  updated_at: string;
  job_title?: string;
  company_name?: string;
  location?: string;
}

const CandidateDashboard = () => {
  const navigate = useNavigate();
  const { user, role, isLoading: roleLoading } = useUserRole();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !user) {
      navigate("/candidate/auth");
      return;
    }
    
    if (!roleLoading && role && role !== 'candidate') {
      toast.error("Access denied. This page is for candidates only.");
      navigate("/dashboard");
      return;
    }

    if (user && role === 'candidate') {
      fetchData();
    }
  }, [user, role, roleLoading, navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch candidate profile
      const { data: profileData, error: profileError } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
      } else {
        setProfile(profileData);
      }

      // Fetch interviews linked to this candidate
      const { data: interviewData, error: interviewError } = await supabase
        .from('interviews')
        .select('id, job_role, status, score, created_at, started_at, completed_at, expires_at')
        .order('created_at', { ascending: false });

      if (interviewError) {
        console.error('Error fetching interviews:', interviewError);
      } else {
        setInterviews(interviewData || []);
      }

      // Fetch job applications
      const { data: applicationsData, error: applicationsError } = await supabase
        .from('job_applications')
        .select('id, job_id, status, cover_letter, applied_at, updated_at')
        .eq('candidate_id', user!.id)
        .order('applied_at', { ascending: false });

      if (applicationsError) {
        console.error('Error fetching applications:', applicationsError);
      } else if (applicationsData && applicationsData.length > 0) {
        // Fetch job details for applications
        const jobIds = applicationsData.map(app => app.job_id);
        const { data: jobsData, error: jobsError } = await supabase
          .from('jobs')
          .select('id, title, location, recruiter_id')
          .in('id', jobIds);

        if (jobsError) {
          console.error('Error fetching job details:', jobsError);
          setApplications(applicationsData);
        } else {
          // Get recruiter profiles for company names
          const recruiterIds = [...new Set(jobsData?.map(j => j.recruiter_id) || [])];
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, company_name')
            .in('id', recruiterIds);

          const profilesMap = new Map(profilesData?.map(p => [p.id, p.company_name]) || []);
          const jobsMap = new Map(jobsData?.map(j => [j.id, { 
            title: j.title, 
            location: j.location,
            company_name: profilesMap.get(j.recruiter_id)
          }]) || []);

          setApplications(applicationsData.map(app => ({
            ...app,
            job_title: jobsMap.get(app.job_id)?.title,
            company_name: jobsMap.get(app.job_id)?.company_name,
            location: jobsMap.get(app.job_id)?.location,
          })));
        }
      } else {
        setApplications([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">In Progress</Badge>;
      case 'pending':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Pending</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getApplicationStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Pending</Badge>;
      case 'reviewing':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Under Review</Badge>;
      case 'interview_scheduled':
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Interview Scheduled</Badge>;
      case 'interviewed':
        return <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30">Interviewed</Badge>;
      case 'offered':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Offer Made</Badge>;
      case 'hired':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Hired!</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Not Selected</Badge>;
      case 'withdrawn':
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Withdrawn</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (roleLoading || isLoading) {
    return <PageLoadingSkeleton />;
  }

  const pendingInterviews = interviews.filter(i => i.status === 'pending');
  const completedInterviews = interviews.filter(i => i.status === 'completed');
  const inProgressInterviews = interviews.filter(i => i.status === 'in_progress');
  const pendingApplications = applications.filter(a => a.status === 'pending' || a.status === 'reviewing');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-semibold">Candidate Portal</h1>
              <p className="text-sm text-muted-foreground">{profile?.email || user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Send className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{applications.length}</p>
                  <p className="text-sm text-muted-foreground">Applications</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Eye className="h-8 w-8 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold">{pendingApplications.length}</p>
                  <p className="text-sm text-muted-foreground">In Review</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold">{interviews.length}</p>
                  <p className="text-sm text-muted-foreground">Interviews</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-400" />
                <div>
                  <p className="text-2xl font-bold">{completedInterviews.length}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Award className="h-8 w-8 text-purple-400" />
                <div>
                  <p className="text-2xl font-bold">
                    {completedInterviews.length > 0 
                      ? Math.round(completedInterviews.reduce((acc, i) => acc + (i.score || 0), 0) / completedInterviews.length)
                      : 0}%
                  </p>
                  <p className="text-sm text-muted-foreground">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="applications" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="applications" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              My Applications
              {applications.length > 0 && (
                <Badge variant="secondary" className="ml-1">{applications.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="interviews" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              My Interviews
            </TabsTrigger>
            <TabsTrigger value="profile">My Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="applications">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Job Applications</h2>
                <Button variant="outline" size="sm" onClick={() => navigate('/jobs')}>
                  <Briefcase className="h-4 w-4 mr-2" />
                  Browse Jobs
                </Button>
              </div>

              {applications.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="py-12 text-center">
                    <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Applications Yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start your job search and apply to positions that match your skills.
                    </p>
                    <Button onClick={() => navigate('/jobs')}>
                      Browse Jobs
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {applications.map((application) => (
                    <Card key={application.id} className="border-border/50 hover:border-primary/30 transition-colors">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building2 className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-medium">{application.job_title || 'Job Position'}</h3>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                {application.company_name && (
                                  <span>{application.company_name}</span>
                                )}
                                {application.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {application.location}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <Calendar className="h-3 w-3" />
                                Applied {format(new Date(application.applied_at), 'MMM d, yyyy')}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {getApplicationStatusBadge(application.status)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="interviews">
            {interviews.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Interviews Yet</h3>
                  <p className="text-muted-foreground">
                    You haven't been invited to any interviews yet. Check back later!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {interviews.map((interview) => (
                  <Card key={interview.id} className="border-border/50">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <FileText className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium">{interview.job_role}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(interview.created_at), 'MMM d, yyyy')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {interview.score !== null && (
                            <div className="text-right">
                              <p className={`text-lg font-bold ${getScoreColor(interview.score * 100)}`}>
                                {Math.round(interview.score * 100)}%
                              </p>
                              <p className="text-xs text-muted-foreground">Score</p>
                            </div>
                          )}
                          {getStatusBadge(interview.status)}
                          {interview.status === 'pending' && (
                            <Button 
                              size="sm"
                              onClick={() => navigate(`/interview/${interview.id}`)}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Start Interview
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="profile">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Your Profile</CardTitle>
                <CardDescription>Manage your candidate information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                    <p className="text-foreground">{profile?.full_name || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="text-foreground">{profile?.email || user?.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Phone</label>
                    <p className="text-foreground">{profile?.phone || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Experience</label>
                    <p className="text-foreground">
                      {profile?.experience_years ? `${profile.experience_years} years` : 'Not set'}
                    </p>
                  </div>
                </div>
                
                {profile?.skills && profile.skills.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Skills</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {profile.skills.map((skill, index) => (
                        <Badge key={index} variant="secondary">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {profile?.bio && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Bio</label>
                    <p className="text-foreground">{profile.bio}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default CandidateDashboard;
