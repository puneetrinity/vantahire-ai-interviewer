-- Create a SECURITY DEFINER function to insert interview messages
-- This bypasses RLS and performs its own authorization check
CREATE OR REPLACE FUNCTION public.insert_interview_message(
  p_interview_id UUID,
  p_role TEXT,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recruiter_id UUID;
  v_is_candidate BOOLEAN;
  v_interview_status TEXT;
  v_message_id UUID;
BEGIN
  -- Get interview info
  SELECT recruiter_id, status INTO v_recruiter_id, v_interview_status
  FROM public.interviews
  WHERE id = p_interview_id;
  
  -- If interview not found, raise error
  IF v_recruiter_id IS NULL THEN
    RAISE EXCEPTION 'Interview not found';
  END IF;
  
  -- Check if interview is in valid status (allow saving even if just completed to capture final messages)
  IF v_interview_status NOT IN ('pending', 'in_progress', 'completed') THEN
    RAISE EXCEPTION 'Interview is not in a valid status for messages';
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
      RAISE EXCEPTION 'Forbidden: Not authorized to add messages to this interview';
    END IF;
  END IF;
  
  -- Insert the message
  INSERT INTO public.interview_messages (interview_id, role, content)
  VALUES (p_interview_id, p_role, p_content)
  RETURNING id INTO v_message_id;
  
  RETURN v_message_id;
END;
$function$;