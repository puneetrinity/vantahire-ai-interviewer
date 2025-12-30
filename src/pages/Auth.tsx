import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, ArrowLeft } from "lucide-react";

type AuthView = "login" | "signup" | "forgot-password";

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          navigate("/dashboard");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (view === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "Successfully signed in." });
      } else if (view === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/verify-email`,
            data: { full_name: fullName }
          }
        });
        if (error) throw error;
        // Redirect to verification pending page
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: error.message || "Something went wrong"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) throw error;
      
      toast({ 
        title: "Check your email", 
        description: "We've sent you a password reset link." 
      });
      setView("login");
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send reset email"
      });
    } finally {
      setLoading(false);
    }
  };

  const renderForgotPasswordForm = () => (
    <>
      <button
        type="button"
        onClick={() => setView("login")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </button>
      
      <h2 className="text-2xl font-bold text-foreground text-center mb-2">
        Reset Password
      </h2>
      <p className="text-muted-foreground text-center mb-6">
        Enter your email and we'll send you a reset link
      </p>

      <form onSubmit={handleForgotPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              required
            />
          </div>
        </div>

        <Button type="submit" variant="hero" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>
    </>
  );

  const renderAuthForm = () => (
    <>
      <h2 className="text-2xl font-bold text-foreground text-center mb-2">
        {view === "login" ? "Welcome Back" : "Create Account"}
      </h2>
      <p className="text-muted-foreground text-center mb-6">
        {view === "login" 
          ? "Sign in to manage your interviews" 
          : "Start conducting AI-powered interviews"}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {view === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-10"
                required={view === "signup"}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {view === "login" && (
              <button
                type="button"
                onClick={() => setView("forgot-password")}
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10"
              required
              minLength={6}
            />
          </div>
        </div>

        <Button type="submit" variant="hero" className="w-full" disabled={loading}>
          {loading ? "Please wait..." : view === "login" ? "Sign In" : "Create Account"}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setView(view === "login" ? "signup" : "login")}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          {view === "login" 
            ? "Don't have an account? Sign up" 
            : "Already have an account? Sign in"}
        </button>
      </div>
    </>
  );

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
          {view === "forgot-password" ? renderForgotPasswordForm() : renderAuthForm()}
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

export default Auth;
