import { useEffect, useState, useCallback } from "react";
import { notifications as notificationsApi, type EmailMessage } from "@/lib/api";
import { useSocket } from "./useSocket";

export const useEmailStatus = (interviewIds: string[]) => {
  const [emailMessages, setEmailMessages] = useState<Record<string, EmailMessage>>({});
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchEmailStatus = useCallback(async () => {
    if (interviewIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await notificationsApi.getEmailStatus(interviewIds);
      setEmailMessages(data);
    } catch (error) {
      console.error("Error fetching email messages:", error);
    } finally {
      setLoading(false);
    }
  }, [interviewIds.join(",")]);

  useEffect(() => {
    fetchEmailStatus();
  }, [fetchEmailStatus]);

  // Listen for realtime updates via socket.io
  useEffect(() => {
    if (!socket || interviewIds.length === 0) return;

    const handleEmailUpdate = (data: { interviewId: string; message: EmailMessage }) => {
      if (interviewIds.includes(data.interviewId)) {
        setEmailMessages((prev) => ({
          ...prev,
          [data.interviewId]: data.message,
        }));
      }
    };

    socket.on("email:status", handleEmailUpdate);

    return () => {
      socket.off("email:status", handleEmailUpdate);
    };
  }, [socket, interviewIds.join(",")]);

  return { emailMessages, loading };
};
