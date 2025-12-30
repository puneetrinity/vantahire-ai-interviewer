-- Drop and recreate the get_candidate_interview_safe function to include candidate_name
DROP FUNCTION IF EXISTS public.get_candidate_interview_safe(UUID);

CREATE FUNCTION public.get_candidate_interview_safe(p_interview_id UUID)
RETURNS TABLE (
  id UUID,
  job_role TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  time_limit_minutes INTEGER,
  expires_at TIMESTAMPTZ,
  score INTEGER,
  candidate_resume_url TEXT,
  candidate_notes TEXT,
  candidate_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    i.id,
    i.job_role,
    i.status,
    i.started_at,
    i.completed_at,
    i.time_limit_minutes,
    i.expires_at,
    i.score,
    i.candidate_resume_url,
    i.candidate_notes,
    i.candidate_name
  FROM public.interviews i
  INNER JOIN public.candidate_interviews ci ON ci.interview_id = i.id
  WHERE i.id = p_interview_id
    AND ci.anon_user_id = auth.uid()
$$;