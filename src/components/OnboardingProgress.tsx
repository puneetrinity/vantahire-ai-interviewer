import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  X,
  Briefcase,
  UserPlus,
  Palette,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trophy,
} from "lucide-react";

interface OnboardingTask {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  isComplete: boolean;
  action?: () => void;
  actionLabel?: string;
}

interface OnboardingProgressProps {
  hasJobs: boolean;
  hasCandidates: boolean;
  hasCompletedInterview: boolean;
  hasBrandingSetup: boolean;
  onCreateJob?: () => void;
  onOpenSettings?: () => void;
}

const OnboardingProgress = ({
  hasJobs,
  hasCandidates,
  hasCompletedInterview,
  hasBrandingSetup,
  onCreateJob,
  onOpenSettings,
}: OnboardingProgressProps) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("vantahire_onboarding_dismissed");
    if (dismissed === "true") {
      setIsDismissed(true);
    }
  }, []);

  const tasks: OnboardingTask[] = useMemo(() => [
    {
      id: "create-job",
      label: "Create your first job",
      description: "Set up a job posting to organize candidates",
      icon: <Briefcase className="w-4 h-4" />,
      isComplete: hasJobs,
      action: onCreateJob,
      actionLabel: "Create Job",
    },
    {
      id: "add-candidate",
      label: "Invite a candidate",
      description: "Send an interview invitation via email",
      icon: <UserPlus className="w-4 h-4" />,
      isComplete: hasCandidates,
    },
    {
      id: "complete-interview",
      label: "Complete an interview",
      description: "Wait for a candidate to finish their AI interview",
      icon: <PlayCircle className="w-4 h-4" />,
      isComplete: hasCompletedInterview,
    },
    {
      id: "setup-branding",
      label: "Customize your brand",
      description: "Add your logo and company colors",
      icon: <Palette className="w-4 h-4" />,
      isComplete: hasBrandingSetup,
      action: onOpenSettings,
      actionLabel: "Open Settings",
    },
  ], [hasJobs, hasCandidates, hasCompletedInterview, hasBrandingSetup, onCreateJob, onOpenSettings]);

  const completedCount = tasks.filter((t) => t.isComplete).length;
  const totalCount = tasks.length;
  const progressPercent = (completedCount / totalCount) * 100;
  const isAllComplete = completedCount === totalCount;

  // Show celebration when all tasks are complete
  useEffect(() => {
    if (isAllComplete && !localStorage.getItem("vantahire_onboarding_celebrated")) {
      setShowCelebration(true);
      localStorage.setItem("vantahire_onboarding_celebrated", "true");
      const timer = setTimeout(() => setShowCelebration(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isAllComplete]);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("vantahire_onboarding_dismissed", "true");
  };

  if (isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-6 bg-card border border-border rounded-xl overflow-hidden shadow-sm"
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              {isAllComplete ? (
                <Trophy className="w-5 h-5 text-primary" />
              ) : (
                <Sparkles className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                {isAllComplete ? "Setup Complete!" : "Getting Started"}
                {showCelebration && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-lg"
                  >
                    🎉
                  </motion.span>
                )}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isAllComplete
                  ? "You've completed all setup tasks"
                  : `${completedCount} of ${totalCount} tasks complete`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
            {isAllComplete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="h-8 w-8"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-2 bg-secondary/30">
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Tasks List */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4 space-y-3">
                {tasks.map((task, index) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      task.isComplete
                        ? "bg-accent/10"
                        : "bg-secondary/50 hover:bg-secondary"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        task.isComplete
                          ? "bg-accent/20 text-accent"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {task.isComplete ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        task.icon
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium text-sm ${
                          task.isComplete
                            ? "text-accent line-through"
                            : "text-foreground"
                        }`}
                      >
                        {task.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {task.description}
                      </p>
                    </div>

                    {!task.isComplete && task.action && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={task.action}
                        className="flex-shrink-0"
                      >
                        {task.actionLabel}
                      </Button>
                    )}

                    {task.isComplete && (
                      <span className="text-xs text-accent font-medium">Done</span>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Dismiss button at bottom when not all complete */}
              {!isAllComplete && (
                <div className="px-4 pb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    Dismiss for now
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default OnboardingProgress;
