-- Add approval columns to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add constraint for valid approval statuses
ALTER TABLE public.jobs 
ADD CONSTRAINT jobs_approval_status_check 
CHECK (approval_status IN ('pending', 'approved', 'rejected'));