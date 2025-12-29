-- Create a secure function for candidates to get their interview data
-- This prevents exposure of sensitive PII like candidate_email to other candidates
CREATE OR REPLACE FUNCTION public.get_candidate_interview_safe(p_interview_id uuid)
RETURNS TABLE (
  id uuid,
  job_role text,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  time_limit_minutes integer,
  expires_at timestamptz,
  score numeric,
  candidate_resume_url text,
  candidate_notes text
)
LANGUAGE sql
STABLE
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
    i.candidate_notes
  FROM public.interviews i
  INNER JOIN public.candidate_interviews ci ON ci.interview_id = i.id
  WHERE i.id = p_interview_id
    AND ci.anon_user_id = auth.uid()
$$;

-- Grant execute permission to authenticated users (including anonymous)
GRANT EXECUTE ON FUNCTION public.get_candidate_interview_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_candidate_interview_safe(uuid) TO anon;

-- Drop the direct SELECT policy for candidates
-- (They will use the safe function instead)
DROP POLICY IF EXISTS "Candidates can view their assigned interview" ON public.interviews;