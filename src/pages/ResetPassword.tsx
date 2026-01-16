import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Info, ArrowLeft } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();

  // Redirect to auth after a few seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/auth");
    }, 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

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
          <div className="text-center">
            <Info className="w-16 h-16 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Password Reset Not Required
            </h2>
            <p className="text-muted-foreground mb-6">
              We now use secure OAuth sign-in with Google and LinkedIn. Password management is handled by your OAuth provider.
            </p>
            <Button variant="hero" className="w-full" onClick={() => navigate("/auth")}>
              Go to Sign In
            </Button>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link to="/" className="hover:text-primary transition-colors flex items-center justify-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
