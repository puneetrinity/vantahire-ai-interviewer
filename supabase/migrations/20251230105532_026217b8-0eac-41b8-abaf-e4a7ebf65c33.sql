-- Allow admins to view all jobs
CREATE POLICY "Admins can view all jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update all jobs
CREATE POLICY "Admins can update all jobs"
ON public.jobs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete all jobs
CREATE POLICY "Admins can delete all jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all interviews
CREATE POLICY "Admins can view all interviews"
ON public.interviews
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update all interviews
CREATE POLICY "Admins can update all interviews"
ON public.interviews
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete all interviews
CREATE POLICY "Admins can delete all interviews"
ON public.interviews
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all candidate profiles
CREATE POLICY "Admins can view all candidate profiles"
ON public.candidate_profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all interview messages
CREATE POLICY "Admins can view all interview messages"
ON public.interview_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all user roles
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all WhatsApp messages
CREATE POLICY "Admins can view all whatsapp messages"
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));