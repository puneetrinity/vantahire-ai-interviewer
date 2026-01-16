import { useState, useEffect, useCallback } from "react";
import { notifications as notificationsApi, type WhatsAppMessage } from "@/lib/api";
import { useSocket } from "./useSocket";

export const useWhatsAppStatus = (interviewIds: string[]) => {
  const [whatsappMessages, setWhatsappMessages] = useState<Record<string, WhatsAppMessage>>({});
  const [loading, setLoading] = useState(false);
  const { socket } = useSocket();

  const fetchWhatsAppStatus = useCallback(async () => {
    if (interviewIds.length === 0) return;

    setLoading(true);
    try {
      const data = await notificationsApi.getWhatsAppStatus(interviewIds);
      setWhatsappMessages(data);
    } catch (error) {
      console.error("Error fetching WhatsApp status:", error);
    } finally {
      setLoading(false);
    }
  }, [interviewIds.join(",")]);

  useEffect(() => {
    fetchWhatsAppStatus();
  }, [fetchWhatsAppStatus]);

  // Listen for realtime updates via socket.io
  useEffect(() => {
    if (!socket || interviewIds.length === 0) return;

    const handleWhatsAppUpdate = (data: { interviewId: string; message: WhatsAppMessage }) => {
      if (interviewIds.includes(data.interviewId)) {
        setWhatsappMessages((prev) => ({
          ...prev,
          [data.interviewId]: data.message,
        }));
      }
    };

    socket.on("whatsapp:status", handleWhatsAppUpdate);

    return () => {
      socket.off("whatsapp:status", handleWhatsAppUpdate);
    };
  }, [socket, interviewIds.join(",")]);

  return { whatsappMessages, loading };
};

export default useWhatsAppStatus;
