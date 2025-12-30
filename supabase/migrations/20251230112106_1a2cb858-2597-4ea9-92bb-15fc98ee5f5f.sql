-- Create job_applications table
CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  cover_letter TEXT,
  resume_url TEXT,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  CONSTRAINT valid_application_status CHECK (status IN ('pending', 'reviewing', 'interview_scheduled', 'interviewed', 'offered', 'hired', 'rejected', 'withdrawn')),
  UNIQUE(job_id, candidate_id)
);

-- Enable RLS
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Candidates can view their own applications
CREATE POLICY "Candidates can view their own applications"
ON public.job_applications
FOR SELECT
USING (auth.uid() = candidate_id);

-- Candidates can create applications
CREATE POLICY "Candidates can create applications"
ON public.job_applications
FOR INSERT
WITH CHECK (auth.uid() = candidate_id);

-- Candidates can update their own applications (withdraw)
CREATE POLICY "Candidates can update their own applications"
ON public.job_applications
FOR UPDATE
USING (auth.uid() = candidate_id);

-- Recruiters can view applications for their jobs
CREATE POLICY "Recruiters can view applications for their jobs"
ON public.job_applications
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.jobs 
  WHERE jobs.id = job_applications.job_id 
  AND jobs.recruiter_id = auth.uid()
));

-- Recruiters can update applications for their jobs
CREATE POLICY "Recruiters can update applications for their jobs"
ON public.job_applications
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.jobs 
  WHERE jobs.id = job_applications.job_id 
  AND jobs.recruiter_id = auth.uid()
));

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
ON public.job_applications
FOR SELECT
USING (has_role(auth.uid(), 'admin'::user_role));

-- Create trigger for updated_at
CREATE TRIGGER update_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();