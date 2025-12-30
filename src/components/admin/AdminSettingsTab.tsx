import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, RefreshCw, Copy, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const AdminSettingsTab = () => {
  const [signupCode, setSignupCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_settings' as any)
        .select('secret_signup_code')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSignupCode((data as any).secret_signup_code || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSignupCode(code);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from('admin_settings' as any)
        .select('id')
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('admin_settings' as any)
          .update({ secret_signup_code: signupCode })
          .eq('id', (existing as any).id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('admin_settings' as any)
          .insert({ secret_signup_code: signupCode });

        if (error) throw error;
      }

      toast({
        title: "Settings saved",
        description: "Admin signup code has been updated"
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings"
      });
    } finally {
      setSaving(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(signupCode);
    toast({
      title: "Copied",
      description: "Signup code copied to clipboard"
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Signup Code</CardTitle>
          <CardDescription>
            This secret code is required to register new admin accounts. Share it only with trusted individuals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signup-code">Secret Signup Code</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="signup-code"
                  type={showCode ? "text" : "password"}
                  value={signupCode}
                  onChange={(e) => setSignupCode(e.target.value)}
                  placeholder="Enter or generate a signup code"
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button variant="outline" size="icon" onClick={copyCode} disabled={!signupCode}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={generateCode}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin Registration</CardTitle>
          <CardDescription>
            New admins can register at the admin signup page using the secret code above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Admin signup URL:</p>
            <code className="text-sm text-primary">
              {window.location.origin}/admin/auth
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
