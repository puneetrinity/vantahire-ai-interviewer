import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { users, files } from "@/lib/api";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import EmailPreview from "@/components/EmailPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LogOut,
  Palette,
  Upload,
  X,
  Sparkles,
  Building2,
  Mail,
  User,
  Save,
  ArrowLeft,
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";

interface LocalProfile {
  companyName: string | null;
  brandColor: string;
  logoUrl: string | null;
  logoFileId: string | null;
  emailIntro: string | null;
  emailTips: string | null;
  emailCtaText: string | null;
  subscriptionStatus: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  createdAt: string;
  lastRequestAt: string | null;
  requestsToday: number;
  rateLimitPerDay: number;
  expiresAt: string | null;
}

const Settings = () => {
  const {
    user,
    recruiterProfile,
    isLoading: authLoading,
    isAuthenticated,
    logout,
    refreshRecruiterProfile,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<LocalProfile>({
    companyName: null,
    brandColor: '#6366f1',
    logoUrl: null,
    logoFileId: null,
    emailIntro: null,
    emailTips: null,
    emailCtaText: null,
    subscriptionStatus: null,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [improvingEmail, setImprovingEmail] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [createKeyDialogOpen, setCreateKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if not authenticated
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }

    // Populate profile from recruiterProfile
    if (recruiterProfile) {
      setProfile({
        companyName: recruiterProfile.companyName,
        brandColor: recruiterProfile.brandColor || '#6366f1',
        logoUrl: recruiterProfile.logoFileId ? files.getUrl(recruiterProfile.logoFileId) : null,
        logoFileId: recruiterProfile.logoFileId,
        emailIntro: recruiterProfile.emailIntro,
        emailTips: recruiterProfile.emailTips,
        emailCtaText: recruiterProfile.emailCtaText,
        subscriptionStatus: recruiterProfile.subscriptionStatus,
      });
    }
    setLoading(false);
  }, [authLoading, isAuthenticated, recruiterProfile, navigate]);

  const fetchApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const data = await users.apiKeys.list();
      setApiKeys(data);
    } catch (error: any) {
      console.error("Error fetching API keys:", error);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchApiKeys();
    }
  }, [isAuthenticated]);

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        variant: "destructive",
        title: "Name Required",
        description: "Please enter a name for your API key."
      });
      return;
    }

    setCreatingKey(true);
    try {
      const result = await users.apiKeys.create(newKeyName.trim());

      setNewlyCreatedKey(result.key);
      setShowNewKey(true);
      setNewKeyName("");
      fetchApiKeys();
      toast({
        title: "API Key Created",
        description: "Your new API key has been generated. Copy it now - you won't be able to see it again!"
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Create API Key",
        description: error.message || "Could not create API key."
      });
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    setDeletingKeyId(keyId);
    try {
      await users.apiKeys.revoke(keyId);

      fetchApiKeys();
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked and can no longer be used."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Revoke Key",
        description: error.message || "Could not revoke API key."
      });
    } finally {
      setDeletingKeyId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);

    try {
      await users.updateRecruiterProfile({
        companyName: profile.companyName,
        brandColor: profile.brandColor,
        emailIntro: profile.emailIntro,
        emailTips: profile.emailTips,
        emailCtaText: profile.emailCtaText,
      });

      await refreshRecruiterProfile();

      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully."
      });
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings"
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const improveEmailWithAI = async () => {
    setImprovingEmail(true);

    try {
      const improved = await users.improveEmailCopy({
        currentIntro: profile.emailIntro,
        currentTips: profile.emailTips,
        currentCta: profile.emailCtaText,
        companyName: profile.companyName,
        tone: "professional"
      });

      setProfile({
        ...profile,
        emailIntro: improved.intro || profile.emailIntro,
        emailTips: improved.tips || profile.emailTips,
        emailCtaText: improved.cta || profile.emailCtaText
      });
      toast({
        title: "Email Copy Improved",
        description: "AI has enhanced your email content."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "AI Enhancement Failed",
        description: error.message || "Could not improve email copy."
      });
    } finally {
      setImprovingEmail(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please upload a PNG, JPG, GIF, WebP, or SVG image."
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "Logo must be less than 2MB."
      });
      return;
    }

    setUploadingLogo(true);

    try {
      const result = await users.uploadLogo(file);

      setProfile({
        ...profile,
        logoUrl: result.url,
        logoFileId: result.logoFileId
      });

      toast({
        title: "Logo Uploaded",
        description: "Your company logo has been uploaded."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "Could not upload logo."
      });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    if (!user) return;

    try {
      await users.deleteLogo();
      setProfile({ ...profile, logoUrl: null, logoFileId: null });
      toast({ title: "Logo Removed" });
    } catch (error: any) {
      console.error("Error removing logo:", error);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  if (authLoading || loading) {
    return <PageLoadingSkeleton variant="form" withLayout showFooter />;
  }

  const headerRightContent = (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>
      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );

  return (
    <AppLayout headerRightContent={headerRightContent} footer="minimal">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your account and branding preferences</p>
          </div>
          <Button onClick={saveProfile} disabled={savingProfile}>
            <Save className="w-4 h-4 mr-2" />
            {savingProfile ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <Tabs defaultValue="branding" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">Branding</span>
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Email</span>
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">API Keys</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="branding" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Company Information
                </CardTitle>
                <CardDescription>
                  Customize how your company appears to candidates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input
                    id="company_name"
                    placeholder="Enter your company name"
                    value={profile.companyName || ""}
                    onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Company Logo</Label>
                  <div className="flex items-center gap-4">
                    {profile.logoUrl ? (
                      <div className="relative">
                        <img
                          src={profile.logoUrl}
                          alt="Company logo"
                          className="h-16 w-16 object-contain rounded-lg border bg-background"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={removeLogo}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center">
                        <Building2 className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                    )}
                    <div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        variant="outline"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingLogo ? "Uploading..." : "Upload Logo"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG, GIF up to 2MB
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brand_color">Brand Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      id="brand_color"
                      value={profile.brandColor}
                      onChange={(e) => setProfile({ ...profile, brandColor: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={profile.brandColor}
                      onChange={(e) => setProfile({ ...profile, brandColor: e.target.value })}
                      className="w-32 font-mono"
                      placeholder="#6366f1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="w-5 h-5" />
                      Email Copy
                    </CardTitle>
                    <CardDescription>
                      Customize the invitation emails sent to candidates
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={improveEmailWithAI}
                    disabled={improvingEmail}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {improvingEmail ? "Improving..." : "Improve with AI"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="email_intro">Introduction Text</Label>
                      <Textarea
                        id="email_intro"
                        placeholder="You've been invited to complete an AI-powered interview for the [Job Role] position."
                        value={profile.emailIntro || ""}
                        onChange={(e) => setProfile({ ...profile, emailIntro: e.target.value })}
                        rows={3}
                        className="resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        Appears after the greeting. Leave empty for default text.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email_tips">Tips for Success</Label>
                      <Textarea
                        id="email_tips"
                        placeholder="Find a quiet place with a stable internet connection. Speak clearly and take your time with each response."
                        value={profile.emailTips || ""}
                        onChange={(e) => setProfile({ ...profile, emailTips: e.target.value })}
                        rows={3}
                        className="resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        Helpful advice shown before the call-to-action button.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email_cta">Button Text</Label>
                      <Input
                        id="email_cta"
                        placeholder="Start Your Interview"
                        value={profile.emailCtaText || ""}
                        onChange={(e) => setProfile({ ...profile, emailCtaText: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Text displayed on the main action button.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <EmailPreview
                      companyName={profile.companyName || ""}
                      brandColor={profile.brandColor}
                      logoUrl={profile.logoUrl}
                      emailIntro={profile.emailIntro || undefined}
                      emailTips={profile.emailTips || undefined}
                      emailCta={profile.emailCtaText || undefined}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="w-5 h-5" />
                      API Keys
                    </CardTitle>
                    <CardDescription>
                      Manage API keys for programmatic access to your account
                    </CardDescription>
                  </div>
                  {profile.subscriptionStatus && profile.subscriptionStatus !== 'FREE' ? (
                    <Button onClick={() => setCreateKeyDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Key
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {profile.subscriptionStatus === 'FREE' || !profile.subscriptionStatus ? (
                  <div className="text-center py-8 space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">Upgrade Required</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        API keys are available on paid plans. Upgrade to access the API.
                      </p>
                    </div>
                  </div>
                ) : loadingKeys ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading API keys...
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-8 space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Key className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">No API Keys</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create your first API key to start integrating with our API.
                      </p>
                    </div>
                    <Button onClick={() => setCreateKeyDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Key
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-4 border rounded-lg bg-muted/30"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{key.name}</span>
                            <Badge
                              variant={key.status === 'active' ? 'default' : 'secondary'}
                              className={key.status === 'active' ? 'bg-accent text-accent-foreground' : ''}
                            >
                              {key.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="font-mono">{key.keyPrefix}•••••••</span>
                            <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                            {key.lastRequestAt && (
                              <span>Last used {new Date(key.lastRequestAt).toLocaleDateString()}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {key.requestsToday} / {key.rateLimitPerDay} requests today
                          </div>
                        </div>
                        {key.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeApiKey(key.id)}
                            disabled={deletingKeyId === key.id}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {deletingKeyId === key.id ? "Revoking..." : "Revoke"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">API Documentation</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>Use your API key in the <code className="bg-muted px-1 py-0.5 rounded">Authorization</code> header:</p>
                <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs">
                  Authorization: Bearer vt_your_api_key_here
                </pre>
                <p className="text-xs">
                  Rate limits: {profile.subscriptionStatus === 'ENTERPRISE' ? '10,000' : '1,000'} requests per day per key.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Account Information
                </CardTitle>
                <CardDescription>
                  Your personal account details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    placeholder="Your name"
                    value={user?.name || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Name is synced from your OAuth provider
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible account actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={createKeyDialogOpen} onOpenChange={setCreateKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Give your API key a descriptive name to help you identify it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key_name">Key Name</Label>
              <Input
                id="key_name"
                placeholder="e.g., Production Server, Development"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateKeyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createApiKey} disabled={creatingKey}>
              {creatingKey ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Newly Created Key Dialog */}
      <Dialog open={!!newlyCreatedKey} onOpenChange={() => setNewlyCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Save Your API Key
            </DialogTitle>
            <DialogDescription>
              This is the only time you'll see this key. Copy it now and store it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Input
                type={showNewKey ? "text" : "password"}
                value={newlyCreatedKey || ""}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNewKey(!showNewKey)}
              >
                {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Store this key securely. You won't be able to see it again.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => { setNewlyCreatedKey(null); setCreateKeyDialogOpen(false); }}>
              I've Saved My Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Settings;
