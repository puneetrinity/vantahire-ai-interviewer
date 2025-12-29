import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Users, Upload, AlertCircle, CheckCircle, Loader2 } from "lucide-react";

interface Candidate {
  email: string;
  name: string;
  jobRole: string;
}

interface BulkInviteResult {
  email: string;
  success: boolean;
  error?: string;
}

interface BulkInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (candidates: Candidate[]) => Promise<BulkInviteResult[]>;
}

const BulkInviteDialog = ({ open, onOpenChange, onSubmit }: BulkInviteDialogProps) => {
  const [bulkInput, setBulkInput] = useState("");
  const [defaultJobRole, setDefaultJobRole] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<BulkInviteResult[] | null>(null);

  const parseCSV = (input: string): Candidate[] => {
    const lines = input.trim().split("\n").filter(line => line.trim());
    const candidates: Candidate[] = [];

    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length >= 1 && parts[0].includes("@")) {
        candidates.push({
          email: parts[0],
          name: parts[1] || "",
          jobRole: parts[2] || defaultJobRole
        });
      }
    }

    return candidates;
  };

  const handleSubmit = async () => {
    const candidates = parseCSV(bulkInput);
    
    if (candidates.length === 0) {
      return;
    }

    setSending(true);
    setResults(null);

    try {
      const results = await onSubmit(candidates);
      setResults(results);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setBulkInput("");
    setDefaultJobRole("");
    setResults(null);
    onOpenChange(false);
  };

  const candidates = parseCSV(bulkInput);
  const successCount = results?.filter(r => r.success).length || 0;
  const failCount = results?.filter(r => !r.success).length || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Bulk Invite Candidates
          </DialogTitle>
          <DialogDescription>
            Send interview invitations to multiple candidates at once.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="defaultJobRole">Default Job Role</Label>
              <Input
                id="defaultJobRole"
                placeholder="e.g., Software Engineer"
                value={defaultJobRole}
                onChange={(e) => setDefaultJobRole(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used when job role is not specified per candidate
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkInput">Candidates (one per line)</Label>
              <Textarea
                id="bulkInput"
                placeholder={`email@example.com, John Doe, Software Engineer
another@email.com, Jane Smith
third@email.com`}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format: email, name (optional), job role (optional)
              </p>
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
                      {c.jobRole && <span className="text-primary">• {c.jobRole}</span>}
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
                disabled={sending || candidates.length === 0 || !defaultJobRole}
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

export default BulkInviteDialog;
