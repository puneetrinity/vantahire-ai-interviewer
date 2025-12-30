import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CandidateFormData {
  email: string;
  name: string;
  phone: string;
}

interface CandidateFormFieldsProps {
  formData: CandidateFormData;
  onChange: (data: CandidateFormData) => void;
  idPrefix?: string;
  disabled?: boolean;
}

const CandidateFormFields = ({ 
  formData, 
  onChange, 
  idPrefix = "candidate",
  disabled = false 
}: CandidateFormFieldsProps) => {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`}>Email *</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          placeholder="candidate@email.com"
          value={formData.email}
          onChange={(e) => onChange({ ...formData, email: e.target.value })}
          required
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Name *</Label>
        <Input
          id={`${idPrefix}-name`}
          placeholder="John Doe"
          value={formData.name}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
          required
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-phone`}>WhatsApp Number *</Label>
        <Input
          id={`${idPrefix}-phone`}
          type="tel"
          placeholder="+91 98765 43210"
          value={formData.phone}
          onChange={(e) => onChange({ ...formData, phone: e.target.value })}
          required
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Include country code for WhatsApp invite
        </p>
      </div>
    </>
  );
};

export default CandidateFormFields;
