-- Create table for WhatsApp message tracking
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  candidate_phone TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Recruiters can view WhatsApp messages for their interviews
CREATE POLICY "Recruiters can view their WhatsApp messages"
ON public.whatsapp_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.interviews i
    WHERE i.id = whatsapp_messages.interview_id
    AND i.recruiter_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_whatsapp_messages_interview_id ON public.whatsapp_messages(interview_id);
CREATE INDEX idx_whatsapp_messages_message_id ON public.whatsapp_messages(message_id);

-- Create trigger for updated_at
CREATE TRIGGER update_whatsapp_messages_updated_at
BEFORE UPDATE ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();