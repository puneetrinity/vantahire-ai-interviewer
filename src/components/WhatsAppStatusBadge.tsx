import { MessageCircle, Check, CheckCheck, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WhatsAppStatusBadgeProps {
  status: string;
  phone?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  className?: string;
}

const WhatsAppStatusBadge = ({
  status,
  phone,
  sentAt,
  deliveredAt,
  readAt,
  className,
}: WhatsAppStatusBadgeProps) => {
  const getStatusConfig = () => {
    switch (status) {
      case "sent":
        return {
          icon: Check,
          color: "text-muted-foreground",
          bg: "bg-muted",
          label: "Sent",
          description: sentAt ? `Sent at ${new Date(sentAt).toLocaleString()}` : "Message sent",
        };
      case "delivered":
        return {
          icon: CheckCheck,
          color: "text-blue-500",
          bg: "bg-blue-500/10",
          label: "Delivered",
          description: deliveredAt ? `Delivered at ${new Date(deliveredAt).toLocaleString()}` : "Message delivered",
        };
      case "read":
        return {
          icon: CheckCheck,
          color: "text-green-500",
          bg: "bg-green-500/10",
          label: "Read",
          description: readAt ? `Read at ${new Date(readAt).toLocaleString()}` : "Message read",
        };
      case "failed":
        return {
          icon: AlertCircle,
          color: "text-destructive",
          bg: "bg-destructive/10",
          label: "Failed",
          description: "Message failed to send",
        };
      default:
        return {
          icon: Clock,
          color: "text-muted-foreground",
          bg: "bg-muted",
          label: "Pending",
          description: "Waiting for status update",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
              config.bg,
              config.color,
              className
            )}
          >
            <MessageCircle className="w-3 h-3" />
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            {phone && (
              <p className="text-xs text-muted-foreground">Phone: {phone}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default WhatsAppStatusBadge;
