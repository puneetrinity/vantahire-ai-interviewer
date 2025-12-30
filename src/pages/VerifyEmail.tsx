import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Mail, Loader2, XCircle } from "lucide-react";

const VerifyEmail = () => {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "pending">("loading");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const handleEmailVerification = async () => {
      // Check if this is a redirect from email confirmation
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      if (token_hash && type === "email") {
        try {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: "email",
          });

          if (error) {
            console.error("Verification error:", error);
            setStatus("error");
            toast({
              variant: "destructive",
              title: "Verification failed",
              description: error.message || "Could not verify your email. Please try again.",
            });
          } else {
            setStatus("success");
            toast({
              title: "Email verified!",
              description: "Your account is now active. Redirecting to dashboard...",
            });
            setTimeout(() => navigate("/dashboard"), 2000);
          }
        } catch (err) {
          console.error("Verification error:", err);
          setStatus("error");
        }
      } else {
        // Check if user already has a session (came here after signup)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email_confirmed_at) {
          setStatus("success");
          setTimeout(() => navigate("/dashboard"), 2000);
        } else {
          setStatus("pending");
        }
      }
    };

    handleEmailVerification();
  }, [searchParams, navigate, toast]);

  const handleResendEmail = async () => {
    const email = searchParams.get("email");
    if (!email) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Email address not found. Please sign up again.",
      });
      return;
    }

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });

      if (error) throw error;

      toast({
        title: "Email sent!",
        description: "A new verification email has been sent.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to resend verification email.",
      });
    }
  };

  const renderContent = () => {
    switch (status) {
      case "loading":
        return (
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Verifying your email...
            </h2>
            <p className="text-muted-foreground">
              Please wait while we confirm your email address.
            </p>
          </div>
        );

      case "success":
        return (
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Email Verified!
            </h2>
            <p className="text-muted-foreground mb-6">
              Your account is now active. Redirecting you to the dashboard...
            </p>
            <Button variant="hero" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        );

      case "error":
        return (
          <div className="text-center">
            <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Verification Failed
            </h2>
            <p className="text-muted-foreground mb-6">
              The verification link may have expired or is invalid.
            </p>
            <div className="space-y-3">
              <Button variant="hero" onClick={() => navigate("/auth")} className="w-full">
                Back to Sign In
              </Button>
              <Button variant="outline" onClick={handleResendEmail} className="w-full">
                Resend Verification Email
              </Button>
            </div>
          </div>
        );

      case "pending":
        return (
          <div className="text-center">
            <Mail className="w-16 h-16 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Check Your Email
            </h2>
            <p className="text-muted-foreground mb-6">
              We've sent a verification link to your email address. Please click the link to activate your account.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-muted-foreground">
                Didn't receive the email? Check your spam folder or click below to resend.
              </p>
            </div>
            <div className="space-y-3">
              <Button variant="outline" onClick={handleResendEmail} className="w-full">
                Resend Verification Email
              </Button>
              <Button variant="ghost" onClick={() => navigate("/auth")} className="w-full">
                Back to Sign In
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <img
            src="/vantahire-logo-2026.jpg"
            alt="Vantahire"
            className="w-10 h-10 rounded-lg object-cover"
          />
          <span className="text-2xl font-bold text-foreground">Vantahire AI Interview</span>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-8">
          {renderContent()}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          <a href="/" className="hover:text-primary transition-colors">
            ← Back to home
          </a>
        </p>
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
