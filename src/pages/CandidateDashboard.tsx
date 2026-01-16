import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { interviews as interviewsApi, applications as applicationsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  User,
  FileText,
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

const CandidateDashboard = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isCandidate, candidateProfile, logout } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/candidate/auth");
      return;
    }

    if (!authLoading && user && !isCandidate) {
      toast.error("Access denied. This page is for candidates only.");
      navigate("/dashboard");
      return;
    }
  }, [user, authLoading, isCandidate, navigate]);

  // Fetch interviews for logged-in candidate
  const { data: interviewsData, isLoading: interviewsLoading } = useQuery({
    queryKey: ["candidate-interviews"],
    queryFn: async () => {
      const response = await interviewsApi.listMine({ limit: 100 });
      return response.data || [];
    },
    enabled: !!user && isCandidate,
  });

  // Fetch job applications for logged-in candidate
  const { data: applicationsData, isLoading: applicationsLoading } = useQuery({
    queryKey: ["candidate-applications"],
    queryFn: async () => {
      const response = await applicationsApi.mine.list({ limit: 100 });
      return response.data || [];
    },
    enabled: !!user && isCandidate,
  });

  const interviews = interviewsData || [];
  const applications = applicationsData || [];

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">In Progress</Badge>;
      case 'PENDING':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Pending</Badge>;
      case 'EXPIRED':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getApplicationStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PENDING':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Pending</Badge>;
      case 'REVIEWED':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Under Review</Badge>;
      case 'SHORTLISTED':
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Shortlisted</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Not Selected</Badge>;
      case 'HIRED':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Hired!</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (authLoading || interviewsLoading || applicationsLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!user || !isCandidate) {
    return null;
  }

  const pendingInterviews = interviews.filter(i => i.status === 'PENDING');
  const completedInterviews = interviews.filter(i => i.status === 'COMPLETED');
  const pendingApplications = applications.filter(a =>
    a.status === 'PENDING' || a.status === 'REVIEWED'
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-semibold">Candidate Portal</h1>
              <p className="text-sm text-muted-foreground">
                {candidateProfile?.email || user?.email}
              </p>
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
                      ? Math.round(completedInterviews.reduce((acc, i) => acc + ((i.score || 0) * 100), 0) / completedInterviews.length)
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
                              <h3 className="font-medium">{application.job?.title || 'Job Position'}</h3>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                {application.job?.recruiter?.recruiterProfile?.companyName && (
                                  <span>{application.job.recruiter.recruiterProfile.companyName}</span>
                                )}
                                {application.job?.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {application.job.location}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <Calendar className="h-3 w-3" />
                                Applied {format(new Date(application.appliedAt), 'MMM d, yyyy')}
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
                            <h3 className="font-medium">{interview.jobRole}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(interview.createdAt), 'MMM d, yyyy')}
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
                          {interview.status === 'PENDING' && (
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
                    <p className="text-foreground">{candidateProfile?.fullName || user?.fullName || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="text-foreground">{candidateProfile?.email || user?.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Phone</label>
                    <p className="text-foreground">{candidateProfile?.phone || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Experience</label>
                    <p className="text-foreground">
                      {candidateProfile?.experienceYears ? `${candidateProfile.experienceYears} years` : 'Not set'}
                    </p>
                  </div>
                </div>

                {candidateProfile?.skills && candidateProfile.skills.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Skills</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {candidateProfile.skills.map((skill, index) => (
                        <Badge key={index} variant="secondary">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {candidateProfile?.bio && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Bio</label>
                    <p className="text-foreground">{candidateProfile.bio}</p>
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
