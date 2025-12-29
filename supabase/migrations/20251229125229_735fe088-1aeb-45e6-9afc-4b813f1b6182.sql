-- Add branding fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#6366f1',
ADD COLUMN IF NOT EXISTS logo_url text;