-- Add policy to allow anonymous users to read the signup code for validation during registration
CREATE POLICY "Allow anonymous read for signup validation"
ON public.admin_settings
FOR SELECT
TO anon
USING (true);