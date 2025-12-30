import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Shield, Key } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AuthView = "login" | "signup";

const AdminAuth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAdmin, isLoading } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && user && isAdmin) {
      navigate("/admin");
    }
  }, [user, isAdmin, isLoading, navigate]);

  const validateSignupCode = async (code: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('admin_settings' as any)
        .select('secret_signup_code')
        .single();

      if (error) {
        console.error('Error validating code:', error);
        return false;
      }

      return (data as any)?.secret_signup_code === code;
    } catch (error) {
      console.error('Error validating signup code:', error);
      return false;
    }
  };

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

        // Check if user is admin
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user) {
          const { data: hasAdminRole } = await supabase
            .rpc('has_role', { _user_id: session.session.user.id, _role: 'admin' as any });

          if (!hasAdminRole) {
            await supabase.auth.signOut();
            throw new Error('You do not have admin privileges');
          }
        }

        toast({ title: "Welcome back!", description: "Successfully signed in as admin." });
        navigate("/admin");
      } else if (view === "signup") {
        // Validate signup code first
        const isValidCode = await validateSignupCode(signupCode);
        if (!isValidCode) {
          throw new Error('Invalid admin signup code');
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin`,
            data: { 
              full_name: fullName,
              role: 'admin'
            }
          }
        });
        if (error) throw error;

        toast({ 
          title: "Account created!", 
          description: "You can now sign in with your admin credentials." 
        });
        setView("login");
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

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield className="w-10 h-10 text-primary" />
          <span className="text-2xl font-bold text-foreground">Admin Portal</span>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-8">
          <h2 className="text-2xl font-bold text-foreground text-center mb-2">
            {view === "login" ? "Admin Login" : "Admin Registration"}
          </h2>
          <p className="text-muted-foreground text-center mb-6">
            {view === "login" 
              ? "Sign in to access admin dashboard" 
              : "Create an admin account with your secret code"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {view === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="signupCode">Admin Signup Code</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signupCode"
                      type="password"
                      placeholder="Enter secret code"
                      value={signupCode}
                      onChange={(e) => setSignupCode(e.target.value)}
                      className="pl-10"
                      required={view === "signup"}
                    />
                  </div>
                </div>

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
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
              {loading ? "Please wait..." : view === "login" ? "Sign In" : "Create Admin Account"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setView(view === "login" ? "signup" : "login")}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {view === "login" 
                ? "Have a signup code? Create admin account" 
                : "Already have an account? Sign in"}
            </button>
          </div>
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

export default AdminAuth;
