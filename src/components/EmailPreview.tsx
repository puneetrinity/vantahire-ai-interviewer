import { Mail } from "lucide-react";

interface EmailPreviewProps {
  companyName: string;
  brandColor: string;
  logoUrl: string | null;
  emailIntro?: string;
  emailTips?: string;
  emailCta?: string;
}

// Helper function to adjust color brightness
const adjustColor = (color: string, amount: number): string => {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const EmailPreview = ({ 
  companyName, 
  brandColor, 
  logoUrl,
  emailIntro,
  emailTips,
  emailCta 
}: EmailPreviewProps) => {
  const displayName = companyName || "Your Company";
  const gradientEnd = adjustColor(brandColor, 20);
  
  const introText = emailIntro || `You've been invited to complete an AI-powered interview for the Software Engineer position at ${displayName}.`;
  const tipsText = emailTips || "Find a quiet place with a stable internet connection. Speak clearly and take your time.";
  const ctaText = emailCta || "Start Your Interview";
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Mail className="w-4 h-4" />
        Email Preview
      </div>
      
      <div className="border border-border rounded-lg overflow-hidden bg-[#f4f4f5] transform scale-[0.65] origin-top -mb-[140px]">
        <div className="p-4 flex justify-center">
          <div className="w-[480px] bg-white rounded-xl shadow-lg overflow-hidden">
            {/* Header */}
            <div 
              className="p-6 text-center"
              style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${gradientEnd} 100%)` }}
            >
              {logoUrl && (
                <img 
                  src={logoUrl} 
                  alt={displayName} 
                  className="max-h-10 max-w-[160px] mx-auto mb-3 object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
              <h1 className="text-white font-bold text-xl m-0">{displayName}</h1>
              <p className="text-white/90 text-xs mt-1">AI-Powered Interview Platform</p>
            </div>
            
            {/* Body */}
            <div className="p-6">
              <h2 className="text-[#18181b] text-lg font-semibold mb-3">Hello John!</h2>
              
              <p className="text-[#52525b] text-sm leading-relaxed mb-4">
                {introText}
              </p>
              
              <div className="bg-[#f4f4f5] rounded-lg p-4 mb-4">
                <h3 className="text-[#18181b] text-sm font-semibold mb-2">What to expect:</h3>
                <ul className="text-[#52525b] text-xs space-y-1.5 pl-4 list-disc">
                  <li>A conversational AI interview experience</li>
                  <li>Approximately 15-30 minutes to complete</li>
                  <li>Questions tailored to the role</li>
                  <li>Complete at your own pace</li>
                </ul>
              </div>
              
              <p className="text-[#52525b] text-xs mb-4">
                <strong>Tips for success:</strong> {tipsText}
              </p>
              
              {/* CTA Button */}
              <div className="text-center py-2">
                <button 
                  className="text-white font-semibold py-3 px-6 rounded-lg text-sm cursor-default"
                  style={{ 
                    background: `linear-gradient(135deg, ${brandColor} 0%, ${gradientEnd} 100%)`,
                    boxShadow: `0 4px 14px ${brandColor}66`
                  }}
                >
                  {ctaText}
                </button>
              </div>
              
              <p className="text-[#a1a1aa] text-[10px] text-center mt-3">
                If the button doesn't work, copy and paste the link into your browser.
              </p>
            </div>
            
            {/* Footer */}
            <div className="bg-[#f4f4f5] px-6 py-4 text-center">
              <p className="text-[#71717a] text-[10px]">
                This interview invitation was sent by {displayName}.<br />
                If you didn't expect this email, you can safely ignore it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailPreview;
