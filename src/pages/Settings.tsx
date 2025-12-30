import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface RecruiterProfile {
  company_name: string | null;
  brand_color: string;
  logo_url: string | null;
  email_intro: string | null;
  email_tips: string | null;
  email_cta_text: string | null;
  full_name: string | null;
  email: string | null;
  subscription_status: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  created_at: string;
  last_request_at: string | null;
  requests_today: number;
  rate_limit_per_day: number;
  expires_at: string | null;
}

const Settings = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<RecruiterProfile>({
    company_name: null,
    brand_color: '#6366f1',
    logo_url: null,
    email_intro: null,
    email_tips: null,
    email_cta_text: null,
    full_name: null,
    email: null,
    subscription_status: null,
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("company_name, brand_color, logo_url, email_intro, email_tips, email_cta_text, full_name, email, subscription_status")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setProfile({
          company_name: data.company_name,
          brand_color: data.brand_color || '#6366f1',
          logo_url: data.logo_url,
          email_intro: data.email_intro,
          email_tips: data.email_tips,
          email_cta_text: data.email_cta_text,
          full_name: data.full_name,
          email: data.email,
          subscription_status: data.subscription_status,
        });
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, status, created_at, last_request_at, requests_today, rate_limit_per_day, expires_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error: any) {
      console.error("Error fetching API keys:", error);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchApiKeys();
    }
  }, [user]);

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
      const { data, error } = await supabase.rpc("generate_api_key", {
        p_name: newKeyName.trim()
      });

      if (error) throw error;

      if (data && data[0]) {
        setNewlyCreatedKey(data[0].full_key);
        setShowNewKey(true);
        setNewKeyName("");
        fetchApiKeys();
        toast({
          title: "API Key Created",
          description: "Your new API key has been generated. Copy it now - you won't be able to see it again!"
        });
      }
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
      const { error } = await supabase
        .from("api_keys")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", keyId);

      if (error) throw error;
      
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
      const { error } = await supabase
        .from("profiles")
        .update({
          company_name: profile.company_name,
          brand_color: profile.brand_color,
          logo_url: profile.logo_url,
          email_intro: profile.email_intro,
          email_tips: profile.email_tips,
          email_cta_text: profile.email_cta_text,
          full_name: profile.full_name,
        })
        .eq("id", user.id);

      if (error) throw error;
      
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

  const getFreshAccessToken = async (): Promise<string | null> => {
    try {
      let { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          navigate("/auth");
          return null;
        }
        session = refreshData.session;
      }
      
      return session.access_token;
    } catch (e) {
      navigate("/auth");
      return null;
    }
  };

  const improveEmailWithAI = async () => {
    setImprovingEmail(true);
    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      setImprovingEmail(false);
      return;
    }
    
    try {
      const { data, error } = await supabase.functions.invoke("improve-email-copy", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          currentIntro: profile.email_intro,
          currentTips: profile.email_tips,
          currentCta: profile.email_cta_text,
          companyName: profile.company_name,
          tone: "professional"
        }
      });

      if (error) throw error;

      if (data?.improved) {
        setProfile({
          ...profile,
          email_intro: data.improved.intro || profile.email_intro,
          email_tips: data.improved.tips || profile.email_tips,
          email_cta_text: data.improved.cta || profile.email_cta_text
        });
        toast({
          title: "Email Copy Improved",
          description: "AI has enhanced your email content."
        });
      }
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/logo-${Date.now()}.${fileExt}`;

      if (profile.logo_url && profile.logo_url.includes('company-logos')) {
        const oldPath = profile.logo_url.split('/company-logos/')[1];
        if (oldPath) {
          await supabase.storage.from('company-logos').remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(fileName);

      setProfile({ ...profile, logo_url: publicUrl });
      
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
      if (profile.logo_url && profile.logo_url.includes('company-logos')) {
        const oldPath = profile.logo_url.split('/company-logos/')[1];
        if (oldPath) {
          await supabase.storage.from('company-logos').remove([oldPath]);
        }
      }
      setProfile({ ...profile, logo_url: null });
      toast({ title: "Logo Removed" });
    } catch (error: any) {
      console.error("Error removing logo:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
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
                    value={profile.company_name || ""}
                    onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Company Logo</Label>
                  <div className="flex items-center gap-4">
                    {profile.logo_url ? (
                      <div className="relative">
                        <img
                          src={profile.logo_url}
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
                      value={profile.brand_color}
                      onChange={(e) => setProfile({ ...profile, brand_color: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={profile.brand_color}
                      onChange={(e) => setProfile({ ...profile, brand_color: e.target.value })}
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
                        value={profile.email_intro || ""}
                        onChange={(e) => setProfile({ ...profile, email_intro: e.target.value })}
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
                        value={profile.email_tips || ""}
                        onChange={(e) => setProfile({ ...profile, email_tips: e.target.value })}
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
                        value={profile.email_cta_text || ""}
                        onChange={(e) => setProfile({ ...profile, email_cta_text: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Text displayed on the main action button.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <EmailPreview
                      companyName={profile.company_name || ""}
                      brandColor={profile.brand_color}
                      logoUrl={profile.logo_url}
                      emailIntro={profile.email_intro || undefined}
                      emailTips={profile.email_tips || undefined}
                      emailCta={profile.email_cta_text || undefined}
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
                  {profile.subscription_status && profile.subscription_status !== 'free' ? (
                    <Button onClick={() => setCreateKeyDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Key
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {profile.subscription_status === 'free' || !profile.subscription_status ? (
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
                            <span className="font-mono">{key.key_prefix}•••••••</span>
                            <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                            {key.last_request_at && (
                              <span>Last used {new Date(key.last_request_at).toLocaleDateString()}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {key.requests_today} / {key.rate_limit_per_day} requests today
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
                  Rate limits: {profile.subscription_status === 'enterprise' ? '10,000' : '1,000'} requests per day per key.
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
                    value={profile.full_name || ""}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || profile.email || ""}
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
