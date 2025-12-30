import { useState, useEffect } from "react";
import Joyride, { CallBackProps, STATUS, Step, ACTIONS, EVENTS } from "react-joyride";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

interface OnboardingTourProps {
  isFirstVisit?: boolean;
}

const tourSteps: Step[] = [
  {
    target: "body",
    content: (
      <div className="space-y-2">
        <h3 className="font-bold text-lg">Welcome to VantaHire! 🎉</h3>
        <p>Let's take a quick tour to help you get started with AI-powered interviews.</p>
        <p className="text-sm text-muted-foreground">This will only take about 2 minutes.</p>
      </div>
    ),
    placement: "center",
    disableBeacon: true,
  },
  {
    target: '[data-tour="stats"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Your Dashboard Stats</h3>
        <p>Track your interview progress at a glance. See total interviews, completion rates, and average scores.</p>
      </div>
    ),
    placement: "bottom",
  },
  {
    target: '[data-tour="tabs"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Jobs & Interviews</h3>
        <p>Switch between <strong>Jobs</strong> (manage job postings) and <strong>All Interviews</strong> (view all candidates).</p>
      </div>
    ),
    placement: "bottom",
  },
  {
    target: '[data-tour="create-job"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Step 1: Create a Job</h3>
        <p>Start by creating a job posting. Add title, description, and requirements.</p>
        <p className="text-sm text-muted-foreground">You can organize candidates by job for better tracking.</p>
      </div>
    ),
    placement: "left",
  },
  {
    target: '[data-tour="job-card"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Step 2: Add Candidates</h3>
        <p>Click on a job to expand it, then add candidates. Each candidate will receive an interview invitation via email.</p>
      </div>
    ),
    placement: "bottom",
    spotlightClicks: true,
  },
  {
    target: '[data-tour="add-candidate-btn"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Add Individual Candidates</h3>
        <p>Click <strong>Add</strong> to invite a single candidate. Enter their email and optionally their phone number for WhatsApp notifications.</p>
      </div>
    ),
    placement: "bottom",
  },
  {
    target: '[data-tour="bulk-invite-btn"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Bulk Invite Candidates</h3>
        <p>Need to invite many candidates at once? Use <strong>Bulk</strong> to upload a CSV or paste multiple emails.</p>
        <p className="text-sm text-muted-foreground">Great for high-volume hiring!</p>
      </div>
    ),
    placement: "bottom",
  },
  {
    target: '[data-tour="whatsapp-status"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">WhatsApp Integration</h3>
        <p>Track WhatsApp message delivery status. See when invitations are sent, delivered, and read by candidates.</p>
        <p className="text-sm text-muted-foreground">Higher response rates with multi-channel outreach!</p>
      </div>
    ),
    placement: "left",
  },
  {
    target: '[data-tour="resend-actions"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Resend Invitations</h3>
        <p>If a candidate hasn't responded, you can resend the invitation via email or WhatsApp with one click.</p>
      </div>
    ),
    placement: "left",
  },
  {
    target: '[data-tour="interviews-tab"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Review All Interviews</h3>
        <p>After candidates complete their AI interviews, view their scores and AI-generated summaries here.</p>
      </div>
    ),
    placement: "bottom",
  },
  {
    target: '[data-tour="settings"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-bold">Customize Your Brand</h3>
        <p>Add your company logo and colors to personalize interview invitations and candidate experience.</p>
      </div>
    ),
    placement: "bottom",
  },
  {
    target: "body",
    content: (
      <div className="space-y-2">
        <h3 className="font-bold text-lg">You're All Set! 🚀</h3>
        <p>That's everything you need to get started. Create your first job and invite candidates to AI interviews.</p>
        <p className="text-sm text-muted-foreground">Click the <HelpCircle className="inline w-4 h-4" /> button anytime to replay this tour.</p>
      </div>
    ),
    placement: "center",
  },
];

const OnboardingTour = ({ isFirstVisit = false }: OnboardingTourProps) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    // Check if user has seen the tour
    const hasSeenTour = localStorage.getItem("vantahire_tour_completed");
    
    if (isFirstVisit && !hasSeenTour) {
      // Delay start to let the page fully render
      const timer = setTimeout(() => {
        setRun(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isFirstVisit]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, action, index, type } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      setStepIndex(0);
      localStorage.setItem("vantahire_tour_completed", "true");
    } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      // Update step index for navigation
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
    }
  };

  const startTour = () => {
    setStepIndex(0);
    setRun(true);
  };

  return (
    <>
      <Joyride
        callback={handleJoyrideCallback}
        continuous
        hideCloseButton
        run={run}
        scrollToFirstStep
        showProgress
        showSkipButton
        stepIndex={stepIndex}
        steps={tourSteps}
        styles={{
          options: {
            arrowColor: "hsl(var(--card))",
            backgroundColor: "hsl(var(--card))",
            overlayColor: "rgba(0, 0, 0, 0.6)",
            primaryColor: "hsl(var(--primary))",
            textColor: "hsl(var(--foreground))",
            zIndex: 10000,
          },
          tooltip: {
            borderRadius: "0.75rem",
            padding: "1rem",
          },
          tooltipContainer: {
            textAlign: "left",
          },
          buttonNext: {
            backgroundColor: "hsl(var(--primary))",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
          },
          buttonBack: {
            color: "hsl(var(--muted-foreground))",
            marginRight: "0.5rem",
          },
          buttonSkip: {
            color: "hsl(var(--muted-foreground))",
          },
          spotlight: {
            borderRadius: "0.75rem",
          },
        }}
        locale={{
          back: "Back",
          close: "Close",
          last: "Got it!",
          next: "Next",
          skip: "Skip tour",
        }}
      />

      {/* Help Button to restart tour */}
      <Button
        variant="outline"
        size="icon"
        onClick={startTour}
        className="fixed bottom-6 right-6 z-50 rounded-full w-12 h-12 shadow-lg bg-card hover:bg-primary hover:text-primary-foreground transition-all duration-200"
        title="Start guided tour"
        data-tour="help-button"
      >
        <HelpCircle className="w-5 h-5" />
      </Button>
    </>
  );
};

export default OnboardingTour;
