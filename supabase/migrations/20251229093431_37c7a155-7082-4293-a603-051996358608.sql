-- ===========================================
-- SECURITY FIX: Remove overly permissive policies
-- ===========================================

-- Drop the dangerous public SELECT policy on interviews
DROP POLICY IF EXISTS "Anyone can view interview by id" ON public.interviews;

-- Drop the dangerous public INSERT policy on interview_messages  
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.interview_messages;

-- Drop the overly permissive SELECT on interview_messages
DROP POLICY IF EXISTS "Anyone can view messages for an interview" ON public.interview_messages;

-- ===========================================
-- Create candidate_interviews table for anon user mapping
-- ===========================================
CREATE TABLE IF NOT EXISTS public.candidate_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  anon_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(interview_id, anon_user_id)
);

ALTER TABLE public.candidate_interviews ENABLE ROW LEVEL SECURITY;

-- Anon users can view their own candidate_interview mapping
CREATE POLICY "Users can view their candidate interview mapping"
  ON public.candidate_interviews FOR SELECT
  USING (auth.uid() = anon_user_id);

-- Anon users can insert their mapping (once per interview)
CREATE POLICY "Users can claim candidate interview"
  ON public.candidate_interviews FOR INSERT
  WITH CHECK (auth.uid() = anon_user_id);

-- ===========================================
-- INTERVIEWS: Updated RLS policies
-- ===========================================

-- Candidates (anonymous users) can view interviews they're linked to
CREATE POLICY "Candidates can view their assigned interview"
  ON public.interviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.interview_id = interviews.id
      AND ci.anon_user_id = auth.uid()
    )
  );

-- Candidates can update specific fields on interviews they're linked to
CREATE POLICY "Candidates can update their interview progress"
  ON public.interviews FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.interview_id = interviews.id
      AND ci.anon_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.interview_id = interviews.id
      AND ci.anon_user_id = auth.uid()
    )
  );

-- ===========================================
-- INTERVIEW_MESSAGES: Updated RLS policies  
-- ===========================================

-- Candidates can view messages for interviews they're linked to
CREATE POLICY "Candidates can view their interview messages"
  ON public.interview_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.interview_id = interview_messages.interview_id
      AND ci.anon_user_id = auth.uid()
    )
  );

-- Candidates can insert messages for their interviews (active only)
CREATE POLICY "Candidates can insert messages for their interview"
  ON public.interview_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      JOIN public.interviews i ON i.id = ci.interview_id
      WHERE ci.interview_id = interview_messages.interview_id
      AND ci.anon_user_id = auth.uid()
      AND i.status IN ('pending', 'in_progress')
    )
  );

-- Recruiters can insert messages for their interviews
CREATE POLICY "Recruiters can insert messages for their interviews"
  ON public.interview_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_messages.interview_id
      AND i.recruiter_id = auth.uid()
    )
  );

-- ===========================================
-- STORAGE: Make interview-documents private
-- ===========================================
UPDATE storage.buckets SET public = false WHERE id = 'interview-documents';

-- Drop existing storage policies
DROP POLICY IF EXISTS "Recruiters can select interview documents" ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can insert interview documents" ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can update interview documents" ON storage.objects;
DROP POLICY IF EXISTS "Recruiters can delete interview documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read interview documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload interview documents" ON storage.objects;

-- Recruiters can manage documents for their interviews
CREATE POLICY "Recruiters can select their interview documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'interview-documents' AND
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id::text = (storage.foldername(name))[1]
      AND i.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "Recruiters can insert their interview documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'interview-documents' AND
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id::text = (storage.foldername(name))[1]
      AND i.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "Recruiters can update their interview documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'interview-documents' AND
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id::text = (storage.foldername(name))[1]
      AND i.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "Recruiters can delete their interview documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'interview-documents' AND
    EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id::text = (storage.foldername(name))[1]
      AND i.recruiter_id = auth.uid()
    )
  );

-- Candidates can upload documents to their interviews
CREATE POLICY "Candidates can upload interview documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'interview-documents' AND
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.interview_id::text = (storage.foldername(name))[1]
      AND ci.anon_user_id = auth.uid()
    )
  );

-- Candidates can view their own uploaded documents
CREATE POLICY "Candidates can view their interview documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'interview-documents' AND
    EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.interview_id::text = (storage.foldername(name))[1]
      AND ci.anon_user_id = auth.uid()
    )
  );

-- ===========================================
-- INPUT VALIDATION: Add message length constraint
-- ===========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'message_content_length_check'
  ) THEN
    ALTER TABLE public.interview_messages 
    ADD CONSTRAINT message_content_length_check 
    CHECK (length(content) <= 10000);
  END IF;
END $$;

-- Add index for faster candidate interview lookups
CREATE INDEX IF NOT EXISTS idx_candidate_interviews_lookup 
  ON public.candidate_interviews(interview_id, anon_user_id);