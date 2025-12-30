import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import MinimalFooter from "@/components/MinimalFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Search, 
  MapPin, 
  Briefcase, 
  Clock, 
  Building2,
  DollarSign,
  ChevronRight,
  Filter,
  CheckCircle,
  Send,
  Loader2
} from "lucide-react";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Job {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  location: string | null;
  job_type: string | null;
  salary_range: string | null;
  created_at: string;
  recruiter_id: string;
  company_name?: string | null;
  logo_url?: string | null;
}

const Jobs = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [user, setUser] = useState<any>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [applicationForm, setApplicationForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    resumeUrl: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  // Check auth status and prefill form
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      // If user is logged in, prefill their details
      if (user) {
        // Get user's candidate profile
        const { data: profile } = await supabase
          .from('candidate_profiles')
          .select('full_name, email, phone, resume_url')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (profile) {
          setApplicationForm({
            fullName: profile.full_name || user.user_metadata?.full_name || "",
            email: profile.email || user.email || "",
            phone: profile.phone || "",
            resumeUrl: profile.resume_url || "",
          });
        } else {
          setApplicationForm({
            fullName: user.user_metadata?.full_name || "",
            email: user.email || "",
            phone: "",
            resumeUrl: "",
          });
        }
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch user's applications
  const { data: userApplications } = useQuery({
    queryKey: ["user-applications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("job_applications")
        .select("job_id, status")
        .eq("candidate_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["public-jobs"],
    queryFn: async () => {
      // First fetch approved jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from("jobs")
        .select(`
          id,
          title,
          description,
          department,
          location,
          job_type,
          salary_range,
          created_at,
          recruiter_id
        `)
        .eq("approval_status", "approved")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (jobsError) throw jobsError;
      if (!jobsData || jobsData.length === 0) return [];

      // Get unique recruiter IDs
      const recruiterIds = [...new Set(jobsData.map(j => j.recruiter_id))];
      
      // Fetch profiles for recruiters
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, company_name, logo_url")
        .in("id", recruiterIds);

      if (profilesError) throw profilesError;

      // Create a map of recruiter profiles
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      // Merge jobs with profile data
      return jobsData.map(job => ({
        ...job,
        company_name: profilesMap.get(job.recruiter_id)?.company_name || null,
        logo_url: profilesMap.get(job.recruiter_id)?.logo_url || null,
      })) as Job[];
    },
  });

  const filteredJobs = jobs?.filter((job) => {
    const matchesSearch = 
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLocation = locationFilter === "all" || job.location === locationFilter;
    const matchesType = jobTypeFilter === "all" || job.job_type === jobTypeFilter;

    return matchesSearch && matchesLocation && matchesType;
  });

  const uniqueLocations = [...new Set(jobs?.map((j) => j.location).filter(Boolean))];
  const uniqueTypes = [...new Set(jobs?.map((j) => j.job_type).filter(Boolean))];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "Posted today";
    if (diffDays <= 7) return `Posted ${diffDays} days ago`;
    if (diffDays <= 30) return `Posted ${Math.ceil(diffDays / 7)} weeks ago`;
    return `Posted ${Math.ceil(diffDays / 30)} months ago`;
  };

  const getJobTypeLabel = (type: string | null) => {
    switch (type) {
      case "full-time": return "Full-time";
      case "part-time": return "Part-time";
      case "contract": return "Contract";
      case "internship": return "Internship";
      default: return type || "Full-time";
    }
  };

  const hasApplied = (jobId: string) => {
    return userApplications?.some(app => app.job_id === jobId);
  };

  const getApplicationStatus = (jobId: string) => {
    const app = userApplications?.find(app => app.job_id === jobId);
    return app?.status;
  };

  const handleResumeUpload = async (file: File) => {
    if (!user) return null;
    
    setUploadingResume(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('interview-documents')
        .upload(fileName, file, { upsert: true });
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('interview-documents')
        .getPublicUrl(fileName);
      
      return publicUrl;
    } catch (error) {
      console.error('Error uploading resume:', error);
      toast.error('Failed to upload resume');
      return null;
    } finally {
      setUploadingResume(false);
    }
  };

  const handleApply = async (job: Job) => {
    if (!user) {
      // Redirect to auth if not logged in
      window.location.href = "/candidate/auth";
      return;
    }

    // Validate required fields
    if (!applicationForm.fullName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!applicationForm.email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    if (!applicationForm.phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    if (!resumeFile && !applicationForm.resumeUrl) {
      toast.error("Please upload your resume");
      return;
    }

    setIsApplying(true);
    try {
      let resumeUrl = applicationForm.resumeUrl;
      
      // Upload resume if a new file was selected
      if (resumeFile) {
        const uploadedUrl = await handleResumeUpload(resumeFile);
        if (uploadedUrl) {
          resumeUrl = uploadedUrl;
        }
      }

      const { error } = await supabase
        .from("job_applications")
        .insert({
          job_id: job.id,
          candidate_id: user.id,
          cover_letter: coverLetter || null,
          resume_url: resumeUrl || null,
          status: "pending",
        });

      if (error) {
        if (error.code === '23505') {
          toast.error("You have already applied to this job");
        } else {
          throw error;
        }
      } else {
        // Update candidate profile with latest info
        await supabase
          .from('candidate_profiles')
          .upsert({
            user_id: user.id,
            full_name: applicationForm.fullName,
            email: applicationForm.email,
            phone: applicationForm.phone || null,
            resume_url: resumeUrl || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        toast.success("Application submitted successfully!");
        queryClient.invalidateQueries({ queryKey: ["user-applications"] });
        setCoverLetter("");
        setResumeFile(null);
        setSelectedJob(null);
      }
    } catch (error: any) {
      console.error("Error applying:", error);
      toast.error("Failed to submit application");
    } finally {
      setIsApplying(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Application Pending";
      case "reviewing": return "Under Review";
      case "interview_scheduled": return "Interview Scheduled";
      case "interviewed": return "Interviewed";
      case "offered": return "Offer Made";
      case "hired": return "Hired";
      case "rejected": return "Not Selected";
      case "withdrawn": return "Withdrawn";
      default: return status;
    }
  };

  const renderApplicationSection = (job: Job) => {
    const applied = hasApplied(job.id);
    const status = getApplicationStatus(job.id);

    if (applied) {
      return (
        <div className="pt-4 border-t">
          <div className="flex items-center gap-2 p-4 bg-primary/10 rounded-lg">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">You've applied to this job</p>
              <p className="text-sm text-muted-foreground">
                Status: {getStatusLabel(status || "pending")}
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full mt-3"
            onClick={() => setSelectedJob(null)}
          >
            Close
          </Button>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="pt-4 border-t space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            Sign in as a candidate to apply for this job
          </p>
          <div className="flex gap-3">
            <Button asChild className="flex-1">
              <a href="/candidate/auth">Sign In to Apply</a>
            </Button>
            <Button variant="outline" onClick={() => setSelectedJob(null)}>
              Close
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="pt-4 border-t space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name <span className="text-destructive">*</span></Label>
            <Input
              id="fullName"
              placeholder="Your full name"
              value={applicationForm.fullName}
              onChange={(e) => setApplicationForm(prev => ({ ...prev, fullName: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={applicationForm.email}
              onChange={(e) => setApplicationForm(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+91 9876543210"
              value={applicationForm.phone}
              onChange={(e) => setApplicationForm(prev => ({ ...prev, phone: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resume">Resume (PDF, DOC) <span className="text-destructive">*</span></Label>
            <Input
              id="resume"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              className="cursor-pointer"
              required={!applicationForm.resumeUrl}
            />
            {applicationForm.resumeUrl && !resumeFile && (
              <p className="text-xs text-green-500">
                ✓ Resume already on file. Upload a new one to replace it.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cover-letter">Cover Letter (Optional)</Label>
          <Textarea
            id="cover-letter"
            placeholder="Tell the employer why you're a great fit for this role..."
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            rows={4}
          />
        </div>
        
        <div className="flex gap-3">
          <Button 
            className="flex-1"
            onClick={() => handleApply(job)}
            disabled={isApplying || uploadingResume}
          >
            {isApplying || uploadingResume ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploadingResume ? "Uploading Resume..." : "Submitting..."}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Application
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => setSelectedJob(null)}>
            Close
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="pt-24 pb-12 px-4 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Find Your Dream Job
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover exciting opportunities at top companies. Apply with AI-powered interviews 
              and get hired faster.
            </p>
          </motion.div>

          {/* Search and Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-card rounded-2xl p-4 md:p-6 shadow-lg border"
          >
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search jobs, companies, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>
              <div className="flex gap-3">
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="w-[160px] h-12">
                    <MapPin className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {uniqueLocations.map((loc) => (
                      <SelectItem key={loc} value={loc!}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
                  <SelectTrigger className="w-[160px] h-12">
                    <Briefcase className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Job Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {uniqueTypes.map((type) => (
                      <SelectItem key={type} value={type!}>{getJobTypeLabel(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Jobs List */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="p-6">
                  <div className="flex gap-4">
                    <Skeleton className="h-16 w-16 rounded-lg" />
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-6 w-1/3" />
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredJobs && filteredJobs.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <p className="text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{filteredJobs.length}</span> jobs
                </p>
              </div>
              
              <div className="space-y-4">
                {filteredJobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card 
                      className="group hover:shadow-lg hover:border-primary/30 transition-all duration-300 cursor-pointer"
                      onClick={() => setSelectedJob(job)}
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row gap-4">
                          {/* Company Logo */}
                          <div className="flex-shrink-0">
                            {job.logo_url ? (
                              <img 
                                src={job.logo_url} 
                                alt={job.company_name || "Company"} 
                                className="h-16 w-16 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-8 w-8 text-primary" />
                              </div>
                            )}
                          </div>

                          {/* Job Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                              <div>
                                <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                                  {job.title}
                                </h3>
                                <p className="text-muted-foreground">
                                  {job.company_name || "Company"}
                                </p>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="hidden md:flex items-center gap-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                              >
                                View Details
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Meta Info */}
                            <div className="flex flex-wrap gap-3 mt-3">
                              {job.location && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <MapPin className="h-4 w-4" />
                                  {job.location}
                                </div>
                              )}
                              {job.job_type && (
                                <Badge variant="secondary">
                                  {getJobTypeLabel(job.job_type)}
                                </Badge>
                              )}
                              {job.department && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Briefcase className="h-4 w-4" />
                                  {job.department}
                                </div>
                              )}
                              {job.salary_range && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <DollarSign className="h-4 w-4" />
                                  {job.salary_range}
                                </div>
                              )}
                            </div>

                            {/* Description Preview */}
                            {job.description && (
                              <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                                {job.description}
                              </p>
                            )}

                            {/* Posted Time */}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3">
                              <Clock className="h-3 w-3" />
                              {formatDate(job.created_at)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Briefcase className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No jobs found</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {searchQuery || locationFilter !== "all" || jobTypeFilter !== "all"
                  ? "Try adjusting your search or filters to find more opportunities."
                  : "There are no job openings at the moment. Check back later!"}
              </p>
              {(searchQuery || locationFilter !== "all" || jobTypeFilter !== "all") && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery("");
                    setLocationFilter("all");
                    setJobTypeFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </motion.div>
          )}
        </div>
      </section>

      {/* Job Details Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedJob && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  {selectedJob.logo_url ? (
                    <img 
                      src={selectedJob.logo_url} 
                      alt={selectedJob.company_name || "Company"} 
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <DialogTitle className="text-2xl">{selectedJob.title}</DialogTitle>
                    <DialogDescription className="text-base">
                      {selectedJob.company_name || "Company"}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Job Meta */}
                <div className="flex flex-wrap gap-3">
                  {selectedJob.location && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm">
                      <MapPin className="h-4 w-4" />
                      {selectedJob.location}
                    </div>
                  )}
                  {selectedJob.job_type && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm">
                      <Briefcase className="h-4 w-4" />
                      {getJobTypeLabel(selectedJob.job_type)}
                    </div>
                  )}
                  {selectedJob.department && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm">
                      <Building2 className="h-4 w-4" />
                      {selectedJob.department}
                    </div>
                  )}
                  {selectedJob.salary_range && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm">
                      <DollarSign className="h-4 w-4" />
                      {selectedJob.salary_range}
                    </div>
                  )}
                </div>

                {/* Description */}
                {selectedJob.description && (
                  <div>
                    <h4 className="font-semibold mb-2">Job Description</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {selectedJob.description}
                    </p>
                  </div>
                )}

                {/* Posted Time */}
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDate(selectedJob.created_at)}
                </div>

                {/* Application Section */}
                {renderApplicationSection(selectedJob)}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <MinimalFooter />
    </div>
  );
};

export default Jobs;