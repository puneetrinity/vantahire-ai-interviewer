-- Fix update_interview_status function with proper authorization checks
CREATE OR REPLACE FUNCTION public.update_interview_status(
  p_interview_id UUID,
  p_status TEXT,
  p_score NUMERIC DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_recruiter_id UUID;
  v_is_candidate BOOLEAN;
BEGIN
  -- Check if caller is the recruiter for this interview
  SELECT recruiter_id INTO v_recruiter_id
  FROM public.interviews
  WHERE id = p_interview_id;
  
  -- If interview not found, exit silently
  IF v_recruiter_id IS NULL THEN
    RAISE EXCEPTION 'Interview not found';
  END IF;
  
  -- Check if user is the recruiter
  IF v_recruiter_id = auth.uid() THEN
    -- Recruiter is authorized to update
    NULL;
  ELSE
    -- Check if caller is the candidate linked to this interview
    SELECT EXISTS(
      SELECT 1 FROM public.candidate_interviews
      WHERE interview_id = p_interview_id
      AND anon_user_id = auth.uid()
    ) INTO v_is_candidate;
    
    IF NOT v_is_candidate THEN
      RAISE EXCEPTION 'Forbidden: Not authorized to update this interview';
    END IF;
  END IF;
  
  -- Perform the update - caller is authorized
  UPDATE public.interviews
  SET 
    status = p_status,
    score = COALESCE(p_score, score),
    completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = p_interview_id;
END;
$$;