import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface WhatsAppMessage {
  id: string;
  interview_id: string;
  candidate_phone: string;
  message_id: string | null;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  error_message: string | null;
}

export const useWhatsAppStatus = (interviewIds: string[]) => {
  const [whatsappMessages, setWhatsappMessages] = useState<Record<string, WhatsAppMessage>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (interviewIds.length === 0) return;

    const fetchWhatsAppStatus = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("whatsapp_messages")
          .select("*")
          .in("interview_id", interviewIds)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching WhatsApp status:", error);
          return;
        }

        // Group by interview_id, keeping only the most recent message per interview
        const messagesMap: Record<string, WhatsAppMessage> = {};
        data?.forEach((msg) => {
          if (!messagesMap[msg.interview_id]) {
            messagesMap[msg.interview_id] = msg as WhatsAppMessage;
          }
        });

        setWhatsappMessages(messagesMap);
      } catch (error) {
        console.error("Error fetching WhatsApp status:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWhatsAppStatus();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("whatsapp-status-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
        },
        (payload) => {
          const updatedMsg = payload.new as WhatsAppMessage;
          if (updatedMsg && interviewIds.includes(updatedMsg.interview_id)) {
            setWhatsappMessages((prev) => ({
              ...prev,
              [updatedMsg.interview_id]: updatedMsg,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [interviewIds.join(",")]);

  return { whatsappMessages, loading };
};

export default useWhatsAppStatus;
