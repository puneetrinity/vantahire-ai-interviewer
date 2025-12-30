import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { XCircle, AlertTriangle, WifiOff, Lock, FileQuestion, Home, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";

interface PageErrorStateProps {
  /** Type of error to display */
  variant?: "not-found" | "unauthorized" | "network" | "generic" | "forbidden";
  /** Custom title (overrides variant default) */
  title?: string;
  /** Custom description (overrides variant default) */
  description?: string;
  /** Whether to wrap in AppLayout */
  withLayout?: boolean;
  /** Show minimal footer in layout */
  showFooter?: boolean;
  /** Custom action button */
  action?: ReactNode;
  /** Show home button */
  showHomeButton?: boolean;
  /** Show back button */
  showBackButton?: boolean;
  /** Show retry button */
  showRetryButton?: boolean;
  /** Retry callback */
  onRetry?: () => void;
}

const errorConfig = {
  "not-found": {
    icon: FileQuestion,
    title: "Page Not Found",
    description: "The page you're looking for doesn't exist or has been moved.",
    iconColor: "text-muted-foreground",
  },
  "unauthorized": {
    icon: Lock,
    title: "Access Denied",
    description: "You don't have permission to access this resource. Please sign in or contact support.",
    iconColor: "text-destructive",
  },
  "network": {
    icon: WifiOff,
    title: "Connection Error",
    description: "Unable to connect to the server. Please check your internet connection and try again.",
    iconColor: "text-amber-500",
  },
  "forbidden": {
    icon: XCircle,
    title: "Access Forbidden",
    description: "You don't have the required permissions to view this content.",
    iconColor: "text-destructive",
  },
  "generic": {
    icon: AlertTriangle,
    title: "Something Went Wrong",
    description: "An unexpected error occurred. Please try again later.",
    iconColor: "text-destructive",
  },
};

const ErrorContent = ({
  variant = "generic",
  title,
  description,
  action,
  showHomeButton = true,
  showBackButton = true,
  showRetryButton = false,
  onRetry,
}: Omit<PageErrorStateProps, "withLayout" | "showFooter">) => {
  const config = errorConfig[variant];
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md px-4"
      >
        <div className={`w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center`}>
          <Icon className={`w-8 h-8 ${config.iconColor}`} />
        </div>
        
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {title || config.title}
        </h1>
        
        <p className="text-muted-foreground mb-8">
          {description || config.description}
        </p>

        {action ? (
          action
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {showRetryButton && onRetry && (
              <Button variant="default" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
            {showHomeButton && (
              <Button variant={showRetryButton ? "outline" : "default"} asChild>
                <Link to="/">
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Link>
              </Button>
            )}
            {showBackButton && (
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

const PageErrorState = ({
  variant = "generic",
  title,
  description,
  withLayout = true,
  showFooter = false,
  action,
  showHomeButton = true,
  showBackButton = true,
  showRetryButton = false,
  onRetry,
}: PageErrorStateProps) => {
  const contentProps = {
    variant,
    title,
    description,
    action,
    showHomeButton,
    showBackButton,
    showRetryButton,
    onRetry,
  };

  if (!withLayout) {
    return <ErrorContent {...contentProps} />;
  }

  return (
    <AppLayout footer={showFooter ? "minimal" : "none"}>
      <ErrorContent {...contentProps} />
    </AppLayout>
  );
};

export default PageErrorState;
