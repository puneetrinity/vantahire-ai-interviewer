-- Create secure function to update interview recording URL
-- This function bypasses RLS and verifies the caller is the linked candidate

CREATE OR REPLACE FUNCTION public.update_interview_recording(
  p_interview_id UUID,
  p_recording_url TEXT
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
    -- Recruiter is authorized
    NULL;
  ELSE
    -- Check if caller is the candidate linked to this interview
    SELECT EXISTS(
      SELECT 1 FROM public.candidate_interviews
      WHERE interview_id = p_interview_id
      AND anon_user_id = auth.uid()
    ) INTO v_is_candidate;
    
    IF NOT v_is_candidate THEN
      RAISE EXCEPTION 'Forbidden: Not authorized to update this interview recording';
    END IF;
  END IF;
  
  -- Perform the update - caller is authorized
  UPDATE public.interviews
  SET recording_url = p_recording_url
  WHERE id = p_interview_id;
END;
$$;