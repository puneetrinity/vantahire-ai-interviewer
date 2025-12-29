-- Fix RLS policies that were accidentally created as RESTRICTIVE.
-- When multiple RESTRICTIVE policies exist for the same command, they are AND-ed,
-- which blocks all inserts/updates for interview messages.

-- interview_messages: drop & recreate INSERT/SELECT policies as PERMISSIVE (default)
DROP POLICY IF EXISTS "Candidates can insert messages for their interview" ON public.interview_messages;
DROP POLICY IF EXISTS "Recruiters can insert messages for their interviews" ON public.interview_messages;
DROP POLICY IF EXISTS "Candidates can view their interview messages" ON public.interview_messages;
DROP POLICY IF EXISTS "Recruiters can view messages for their interviews" ON public.interview_messages;

CREATE POLICY "Candidates can insert messages for their interview"
ON public.interview_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    JOIN public.interviews i ON i.id = ci.interview_id
    WHERE ci.interview_id = interview_messages.interview_id
      AND ci.anon_user_id = auth.uid()
      AND i.status = ANY (ARRAY['pending'::text, 'in_progress'::text])
  )
);

CREATE POLICY "Recruiters can insert messages for their interviews"
ON public.interview_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.interviews i
    WHERE i.id = interview_messages.interview_id
      AND i.recruiter_id = auth.uid()
  )
);

CREATE POLICY "Candidates can view their interview messages"
ON public.interview_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    WHERE ci.interview_id = interview_messages.interview_id
      AND ci.anon_user_id = auth.uid()
  )
);

CREATE POLICY "Recruiters can view messages for their interviews"
ON public.interview_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.interviews i
    WHERE i.id = interview_messages.interview_id
      AND i.recruiter_id = auth.uid()
  )
);

-- interviews: drop & recreate UPDATE policies as PERMISSIVE (default)
DROP POLICY IF EXISTS "Candidates can update their interview progress" ON public.interviews;
DROP POLICY IF EXISTS "Recruiters can update their own interviews" ON public.interviews;

CREATE POLICY "Candidates can update their interview progress"
ON public.interviews
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    WHERE ci.interview_id = interviews.id
      AND ci.anon_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.candidate_interviews ci
    WHERE ci.interview_id = interviews.id
      AND ci.anon_user_id = auth.uid()
  )
);

CREATE POLICY "Recruiters can update their own interviews"
ON public.interviews
FOR UPDATE
TO authenticated
USING (auth.uid() = recruiter_id)
WITH CHECK (auth.uid() = recruiter_id);
