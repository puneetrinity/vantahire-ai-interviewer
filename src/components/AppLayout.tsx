import { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import Footer from "@/components/Footer";

interface AppLayoutProps {
  /** Main content of the page */
  children: ReactNode;
  /** Optional right-side content for the header (user info, job status, timer, etc.) */
  headerRightContent?: ReactNode;
  /** Whether the logo should link to home (default: true) */
  linkToHome?: boolean;
  /** Additional classes for the main container */
  containerClassName?: string;
  /** Whether to use the full-height flex layout (default: false) */
  fullHeight?: boolean;
  /** Content to render outside the main container (dialogs, modals, etc.) */
  outsideContent?: ReactNode;
  /** Whether to show the footer (default: false) */
  showFooter?: boolean;
}

const AppLayout = ({ 
  children, 
  headerRightContent,
  linkToHome = true,
  containerClassName = "",
  fullHeight = false,
  outsideContent,
  showFooter = false
}: AppLayoutProps) => {
  return (
    <div className={`min-h-screen bg-background ${fullHeight ? "flex flex-col" : ""}`}>
      <AppHeader rightContent={headerRightContent} linkToHome={linkToHome} />
      
      <main className={`container mx-auto px-4 py-8 ${fullHeight ? "flex-1 flex flex-col" : ""} ${containerClassName}`}>
        {children}
      </main>

      {showFooter && <Footer />}
      {outsideContent}
    </div>
  );
};

export default AppLayout;
