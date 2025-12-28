-- Add columns for recording and documents to interviews table
ALTER TABLE public.interviews 
ADD COLUMN IF NOT EXISTS time_limit_minutes integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS recording_url text,
ADD COLUMN IF NOT EXISTS transcript_summary text,
ADD COLUMN IF NOT EXISTS candidate_resume_url text,
ADD COLUMN IF NOT EXISTS candidate_notes text;

-- Create storage bucket for interview documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('interview-documents', 'interview-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for interview documents
CREATE POLICY "Anyone can upload interview documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'interview-documents');

CREATE POLICY "Recruiters can view their interview documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'interview-documents' 
  AND (
    EXISTS (
      SELECT 1 FROM interviews 
      WHERE interviews.recruiter_id = auth.uid() 
      AND storage.objects.name LIKE interviews.id::text || '%'
    )
    OR auth.uid() IS NULL -- Allow public access for candidates with direct link
  )
);