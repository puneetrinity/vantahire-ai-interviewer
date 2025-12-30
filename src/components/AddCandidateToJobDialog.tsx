import { useState } from "react";
import { Button } from "@/components/ui/button";
import CandidateFormFields, { CandidateFormData } from "@/components/CandidateFormFields";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, Loader2, AlertTriangle } from "lucide-react";

interface Job {
  id: string;
  title: string;
}

interface ExistingCandidate {
  email: string;
  name: string | null;
  status: string;
}

interface AddCandidateToJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onSubmit: (candidate: { email: string; name: string; phone: string }) => Promise<void>;
  existingCandidates?: ExistingCandidate[];
}

const AddCandidateToJobDialog = ({ open, onOpenChange, job, onSubmit, existingCandidates = [] }: AddCandidateToJobDialogProps) => {
  const [formData, setFormData] = useState<CandidateFormData>({
    email: "",
    name: "",
    phone: ""
  });
  const [adding, setAdding] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateCandidate, setDuplicateCandidate] = useState<ExistingCandidate | null>(null);

  const checkForDuplicate = (email: string): ExistingCandidate | undefined => {
    return existingCandidates.find(
      (c) => c.email.toLowerCase() === email.toLowerCase()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for duplicate
    const existing = checkForDuplicate(formData.email);
    if (existing) {
      setDuplicateCandidate(existing);
      setShowDuplicateWarning(true);
      return;
    }

    await proceedWithSubmit();
  };

  const proceedWithSubmit = async () => {
    setAdding(true);
    try {
      await onSubmit(formData);
      setFormData({ email: "", name: "", phone: "" });
      onOpenChange(false);
    } finally {
      setAdding(false);
    }
  };

  const handleConfirmDuplicate = async () => {
    setShowDuplicateWarning(false);
    setDuplicateCandidate(null);
    await proceedWithSubmit();
  };

  const handleCancelDuplicate = () => {
    setShowDuplicateWarning(false);
    setDuplicateCandidate(null);
  };

  if (!job) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add Candidate
            </DialogTitle>
            <DialogDescription>
              Add a candidate to interview for <strong>{job.title}</strong>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <CandidateFormFields
              formData={formData}
              onChange={setFormData}
              idPrefix="add-candidate"
              disabled={adding}
            />

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" variant="hero" disabled={adding || !formData.email || !formData.name || !formData.phone} className="flex-1">
                {adding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add & Send Invite"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDuplicateWarning} onOpenChange={setShowDuplicateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              Duplicate Candidate
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                A candidate with email <strong>{duplicateCandidate?.email}</strong> already exists for this job.
              </p>
              {duplicateCandidate && (
                <div className="bg-muted p-3 rounded-lg mt-2">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="text-foreground">{duplicateCandidate.name || "N/A"}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Status:</span>{" "}
                    <span className="text-foreground capitalize">{duplicateCandidate.status}</span>
                  </p>
                </div>
              )}
              <p className="text-sm mt-2">
                Do you still want to add this candidate again?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDuplicate}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDuplicate} className="bg-amber-600 hover:bg-amber-700">
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AddCandidateToJobDialog;
