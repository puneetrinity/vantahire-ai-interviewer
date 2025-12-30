import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import MinimalFooter from "@/components/MinimalFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  MapPin, 
  Briefcase, 
  Clock, 
  Building2,
  DollarSign,
  ChevronRight,
  Filter
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
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

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

                {/* Apply Button */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button asChild className="flex-1">
                    <a href="/candidate/auth">Apply Now</a>
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedJob(null)}>
                    Close
                  </Button>
                </div>
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