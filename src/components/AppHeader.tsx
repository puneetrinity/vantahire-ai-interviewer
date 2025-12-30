import { Link } from "react-router-dom";
import { ReactNode } from "react";

interface AppHeaderProps {
  /** Optional right-side content (user info, job status, timer, etc.) */
  rightContent?: ReactNode;
  /** Whether the logo should link to home (default: true) */
  linkToHome?: boolean;
}

const AppHeader = ({ rightContent, linkToHome = true }: AppHeaderProps) => {
  const LogoContent = (
    <div className="flex items-center gap-2">
      <img 
        src="/vantahire-logo-2026.jpg" 
        alt="Vantahire" 
        className="w-9 h-9 rounded-lg object-cover"
      />
      <span className="text-xl font-bold text-foreground">Vantahire AI Interview</span>
    </div>
  );

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {linkToHome ? (
          <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            {LogoContent}
          </Link>
        ) : (
          LogoContent
        )}

        {rightContent && (
          <div className="flex items-center gap-4">
            {rightContent}
          </div>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
