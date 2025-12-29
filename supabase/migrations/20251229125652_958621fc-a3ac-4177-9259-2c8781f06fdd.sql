-- Create a public bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own logo
CREATE POLICY "Users can upload their company logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own logo
CREATE POLICY "Users can update their company logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own logo
CREATE POLICY "Users can delete their company logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public access to view logos (needed for emails)
CREATE POLICY "Company logos are publicly accessible"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'company-logos');