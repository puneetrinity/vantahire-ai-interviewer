-- Drop the problematic policy that causes recursion
DROP POLICY IF EXISTS "Candidates can view their own interviews" ON public.interviews;

-- Recreate without referencing candidate_profiles (which references interviews)
CREATE POLICY "Candidates can view their own interviews"
ON public.interviews
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'candidate'::user_role) 
  AND (
    candidate_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.candidate_interviews ci
      WHERE ci.interview_id = interviews.id
      AND ci.anon_user_id = auth.uid()
    )
  )
);

-- Also fix the candidate_profiles policy that references interviews
DROP POLICY IF EXISTS "Recruiters can view candidate profiles for their interviews" ON public.candidate_profiles;

-- Recreate using a simpler approach without cross-referencing
CREATE POLICY "Recruiters can view candidate profiles for their interviews"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'recruiter'::user_role)
);