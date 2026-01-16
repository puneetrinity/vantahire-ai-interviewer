import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { admin as adminApi } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, RefreshCw, Copy, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const AdminSettingsTab = () => {
  const [showCode, setShowCode] = useState(false);
  const [localSettings, setLocalSettings] = useState({
    secretSignupCode: "",
    maxInterviewsPerRecruiter: 50,
    defaultInterviewDuration: 30,
    enableEmailNotifications: true,
    enableWhatsAppNotifications: false,
    maintenanceMode: false,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch settings
  const { isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi.getSettings(),
    onSuccess: (data) => {
      setLocalSettings({
        secretSignupCode: data.secretSignupCode || "",
        maxInterviewsPerRecruiter: data.maxInterviewsPerRecruiter || 50,
        defaultInterviewDuration: data.defaultInterviewDuration || 30,
        enableEmailNotifications: data.enableEmailNotifications ?? true,
        enableWhatsAppNotifications: data.enableWhatsAppNotifications ?? false,
        maintenanceMode: data.maintenanceMode ?? false,
      });
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: Parameters<typeof adminApi.updateSettings>[0]) =>
      adminApi.updateSettings(data),
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Admin settings have been updated"
      });
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save settings"
      });
    },
  });

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setLocalSettings(prev => ({ ...prev, secretSignupCode: code }));
  };

  const copyCode = () => {
    navigator.clipboard.writeText(localSettings.secretSignupCode);
    toast({
      title: "Copied",
      description: "Signup code copied to clipboard"
    });
  };

  const handleSave = () => {
    updateSettingsMutation.mutate(localSettings);
  };

  if (isLoading) {
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
            This secret code is required to assign admin privileges to new users.
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
                  value={localSettings.secretSignupCode}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    secretSignupCode: e.target.value
                  }))}
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
              <Button
                variant="outline"
                size="icon"
                onClick={copyCode}
                disabled={!localSettings.secretSignupCode}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={generateCode}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>
            Configure global platform settings and limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max-interviews">Max Interviews per Recruiter</Label>
              <Input
                id="max-interviews"
                type="number"
                min={1}
                value={localSettings.maxInterviewsPerRecruiter}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  maxInterviewsPerRecruiter: parseInt(e.target.value) || 50
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-duration">Default Interview Duration (minutes)</Label>
              <Input
                id="default-duration"
                type="number"
                min={5}
                max={120}
                value={localSettings.defaultInterviewDuration}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  defaultInterviewDuration: parseInt(e.target.value) || 30
                }))}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Send email notifications for interviews and applications
                </p>
              </div>
              <Switch
                checked={localSettings.enableEmailNotifications}
                onCheckedChange={(checked) => setLocalSettings(prev => ({
                  ...prev,
                  enableEmailNotifications: checked
                }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>WhatsApp Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Send WhatsApp notifications for interviews
                </p>
              </div>
              <Switch
                checked={localSettings.enableWhatsAppNotifications}
                onCheckedChange={(checked) => setLocalSettings(prev => ({
                  ...prev,
                  enableWhatsAppNotifications: checked
                }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Temporarily disable platform access for non-admins
                </p>
              </div>
              <Switch
                checked={localSettings.maintenanceMode}
                onCheckedChange={(checked) => setLocalSettings(prev => ({
                  ...prev,
                  maintenanceMode: checked
                }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin Registration</CardTitle>
          <CardDescription>
            New admins can request access through the admin portal using the secret code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Admin portal URL:</p>
            <code className="text-sm text-primary">
              {window.location.origin}/admin/auth
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
