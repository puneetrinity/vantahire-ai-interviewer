-- Allow public read access to approved jobs
CREATE POLICY "Anyone can view approved jobs" 
ON public.jobs 
FOR SELECT 
USING (approval_status = 'approved' AND status = 'active');