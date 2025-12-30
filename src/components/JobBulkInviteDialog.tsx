import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Users, Upload, AlertCircle, CheckCircle, Loader2, MessageCircle } from "lucide-react";

interface Job {
  id: string;
  title: string;
}

interface Candidate {
  email: string;
  name: string;
  phone?: string;
}

interface BulkInviteResult {
  email: string;
  success: boolean;
  error?: string;
  whatsappSent?: boolean;
}

interface JobBulkInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onSubmit: (candidates: Candidate[], sendWhatsApp: boolean) => Promise<BulkInviteResult[]>;
}

const JobBulkInviteDialog = ({ open, onOpenChange, job, onSubmit }: JobBulkInviteDialogProps) => {
  const [bulkInput, setBulkInput] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<BulkInviteResult[] | null>(null);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);

  const parseCSV = (input: string): Candidate[] => {
    const lines = input.trim().split("\n").filter(line => line.trim());
    const candidates: Candidate[] = [];

    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length >= 1 && parts[0].includes("@")) {
        candidates.push({
          email: parts[0],
          name: parts[1] || "",
          phone: parts[2] || undefined
        });
      }
    }

    return candidates;
  };

  const handleSubmit = async () => {
    const candidates = parseCSV(bulkInput);
    
    if (candidates.length === 0) return;

    setSending(true);
    setResults(null);

    try {
      const results = await onSubmit(candidates, sendWhatsApp);
      setResults(results);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setBulkInput("");
    setResults(null);
    setSendWhatsApp(false);
    onOpenChange(false);
  };

  if (!job) return null;

  const candidates = parseCSV(bulkInput);
  const successCount = results?.filter(r => r.success).length || 0;
  const failCount = results?.filter(r => !r.success).length || 0;
  const whatsappCount = results?.filter(r => r.whatsappSent).length || 0;
  const candidatesWithPhone = candidates.filter(c => c.phone).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Bulk Invite for {job.title}
          </DialogTitle>
          <DialogDescription>
            Send interview invitations to multiple candidates for this job posting.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4 mt-4">
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-sm text-foreground">
                All candidates will be invited to interview for: <strong>{job.title}</strong>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkInput">Candidates (one per line)</Label>
              <Textarea
                id="bulkInput"
                placeholder={`email@example.com, John Doe, +919876543210
another@email.com, Jane Smith, +918765432109
third@email.com`}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format: email, name (optional), phone (optional for WhatsApp)
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Send WhatsApp Invites</p>
                  <p className="text-xs text-muted-foreground">
                    {candidatesWithPhone > 0 
                      ? `${candidatesWithPhone} candidate${candidatesWithPhone !== 1 ? 's' : ''} with phone numbers`
                      : 'Add phone numbers to enable WhatsApp'}
                  </p>
                </div>
              </div>
              <Switch
                checked={sendWhatsApp}
                onCheckedChange={setSendWhatsApp}
                disabled={candidatesWithPhone === 0}
              />
            </div>

            {candidates.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="text-sm font-medium text-foreground">
                  Preview: {candidates.length} candidate{candidates.length !== 1 ? "s" : ""} detected
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {candidates.slice(0, 10).map((c, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="font-mono">{c.email}</span>
                      {c.name && <span>• {c.name}</span>}
                      {c.phone && (
                        <span className="flex items-center gap-1 text-green-500">
                          <MessageCircle className="w-3 h-3" />
                          {c.phone}
                        </span>
                      )}
                    </div>
                  ))}
                  {candidates.length > 10 && (
                    <div className="text-xs text-muted-foreground italic">
                      ... and {candidates.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="hero"
                onClick={handleSubmit}
                disabled={sending || candidates.length === 0}
                className="flex-1"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Send {candidates.length} Invite{candidates.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2 text-accent">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">{successCount} sent</span>
                </div>
                {whatsappCount > 0 && (
                  <div className="flex items-center gap-2 text-green-500">
                    <MessageCircle className="w-5 h-5" />
                    <span className="font-medium">{whatsappCount} WhatsApp</span>
                  </div>
                )}
                {failCount > 0 && (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">{failCount} failed</span>
                  </div>
                )}
              </div>
              
              <div className="max-h-60 overflow-y-auto space-y-2">
                {results.map((result, i) => (
                  <div 
                    key={i} 
                    className={`text-sm flex items-center gap-2 p-2 rounded ${
                      result.success ? "bg-accent/10" : "bg-destructive/10"
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle className="w-4 h-4 text-accent shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <span className="font-mono text-xs">{result.email}</span>
                    {result.whatsappSent && (
                      <MessageCircle className="w-3 h-3 text-green-500 shrink-0" />
                    )}
                    {result.error && (
                      <span className="text-xs text-destructive ml-auto">{result.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button variant="hero" onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default JobBulkInviteDialog;
