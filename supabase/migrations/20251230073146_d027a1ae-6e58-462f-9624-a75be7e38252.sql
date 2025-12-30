-- Create subscription status enum
CREATE TYPE public.subscription_status AS ENUM ('free', 'paid', 'enterprise');

-- Create API key status enum  
CREATE TYPE public.api_key_status AS ENUM ('active', 'revoked', 'expired');

-- Add subscription status to profiles
ALTER TABLE public.profiles 
ADD COLUMN subscription_status subscription_status DEFAULT 'free',
ADD COLUMN subscription_updated_at TIMESTAMP WITH TIME ZONE;

-- Create API keys table
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- Store hashed key, not plain text
  key_prefix TEXT NOT NULL, -- Store first 8 chars for display (e.g., "vt_abc123...")
  status api_key_status DEFAULT 'active',
  scopes TEXT[] DEFAULT ARRAY['interviews:read', 'interviews:write', 'jobs:read', 'jobs:write', 'candidates:invite', 'reports:read', 'reports:share'],
  rate_limit_per_day INTEGER DEFAULT 1000,
  requests_today INTEGER DEFAULT 0,
  last_request_at TIMESTAMP WITH TIME ZONE,
  last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  revoked_at TIMESTAMP WITH TIME ZONE
);

-- Create API usage logs table
CREATE TABLE public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for api_keys
CREATE POLICY "Users can view their own API keys"
ON public.api_keys FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create API keys if paid"
ON public.api_keys FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND subscription_status IN ('paid', 'enterprise')
  )
);

CREATE POLICY "Users can update their own API keys"
ON public.api_keys FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
ON public.api_keys FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for api_usage_logs
CREATE POLICY "Users can view their own API usage logs"
ON public.api_usage_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.api_keys 
    WHERE api_keys.id = api_usage_logs.api_key_id 
    AND api_keys.user_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_key_prefix ON public.api_keys(key_prefix);
CREATE INDEX idx_api_usage_logs_api_key_id ON public.api_usage_logs(api_key_id);
CREATE INDEX idx_api_usage_logs_created_at ON public.api_usage_logs(created_at);

-- Function to generate API key (returns full key only once)
CREATE OR REPLACE FUNCTION public.generate_api_key(p_name TEXT)
RETURNS TABLE(api_key_id UUID, full_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_subscription subscription_status;
  v_raw_key TEXT;
  v_key_hash TEXT;
  v_key_prefix TEXT;
  v_new_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check subscription status
  SELECT subscription_status INTO v_subscription
  FROM public.profiles WHERE id = v_user_id;
  
  IF v_subscription IS NULL OR v_subscription = 'free' THEN
    RAISE EXCEPTION 'API keys require a paid subscription';
  END IF;
  
  -- Generate random key: vt_ + 32 random chars
  v_raw_key := 'vt_' || encode(gen_random_bytes(24), 'base64');
  v_raw_key := replace(replace(replace(v_raw_key, '+', ''), '/', ''), '=', '');
  v_key_prefix := substring(v_raw_key from 1 for 11);
  v_key_hash := encode(sha256(v_raw_key::bytea), 'hex');
  
  -- Insert new API key
  INSERT INTO public.api_keys (user_id, name, key_hash, key_prefix, rate_limit_per_day)
  VALUES (v_user_id, p_name, v_key_hash, v_key_prefix, 
    CASE WHEN v_subscription = 'enterprise' THEN 10000 ELSE 1000 END
  )
  RETURNING id INTO v_new_id;
  
  -- Return the key (this is the only time the full key is available)
  RETURN QUERY SELECT v_new_id, v_raw_key;
END;
$$;

-- Function to validate API key and check rate limits
CREATE OR REPLACE FUNCTION public.validate_api_key(p_api_key TEXT)
RETURNS TABLE(
  is_valid BOOLEAN,
  user_id UUID,
  api_key_id UUID,
  scopes TEXT[],
  rate_limit_remaining INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_hash TEXT;
  v_key_record RECORD;
  v_rate_limit_remaining INTEGER;
BEGIN
  -- Hash the provided key
  v_key_hash := encode(sha256(p_api_key::bytea), 'hex');
  
  -- Find the API key
  SELECT ak.*, p.subscription_status
  INTO v_key_record
  FROM public.api_keys ak
  JOIN public.profiles p ON p.id = ak.user_id
  WHERE ak.key_hash = v_key_hash;
  
  IF v_key_record IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::TEXT[], 0, 'Invalid API key'::TEXT;
    RETURN;
  END IF;
  
  -- Check if key is active
  IF v_key_record.status != 'active' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::TEXT[], 0, 'API key is revoked or expired'::TEXT;
    RETURN;
  END IF;
  
  -- Check if key is expired
  IF v_key_record.expires_at IS NOT NULL AND v_key_record.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::TEXT[], 0, 'API key has expired'::TEXT;
    RETURN;
  END IF;
  
  -- Check subscription status
  IF v_key_record.subscription_status = 'free' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::TEXT[], 0, 'Subscription expired'::TEXT;
    RETURN;
  END IF;
  
  -- Reset daily counter if needed
  IF v_key_record.last_reset_at::date < CURRENT_DATE THEN
    UPDATE public.api_keys 
    SET requests_today = 0, last_reset_at = now()
    WHERE id = v_key_record.id;
    v_key_record.requests_today := 0;
  END IF;
  
  -- Check rate limit
  v_rate_limit_remaining := v_key_record.rate_limit_per_day - v_key_record.requests_today;
  
  IF v_rate_limit_remaining <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::TEXT[], 0, 'Rate limit exceeded'::TEXT;
    RETURN;
  END IF;
  
  -- Increment request counter
  UPDATE public.api_keys 
  SET requests_today = requests_today + 1, last_request_at = now()
  WHERE id = v_key_record.id;
  
  RETURN QUERY SELECT 
    true, 
    v_key_record.user_id, 
    v_key_record.id, 
    v_key_record.scopes,
    v_rate_limit_remaining - 1,
    NULL::TEXT;
END;
$$;