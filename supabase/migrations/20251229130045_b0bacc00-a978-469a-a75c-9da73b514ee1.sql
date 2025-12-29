-- Add custom email copy fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_intro TEXT,
ADD COLUMN IF NOT EXISTS email_tips TEXT,
ADD COLUMN IF NOT EXISTS email_cta_text TEXT DEFAULT 'Start Your Interview';