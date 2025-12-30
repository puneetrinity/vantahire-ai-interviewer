import { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import Footer from "@/components/Footer";
import MinimalFooter from "@/components/MinimalFooter";

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
  /** Footer variant: 'none' | 'full' | 'minimal' (default: 'none') */
  footer?: 'none' | 'full' | 'minimal';
}

const AppLayout = ({ 
  children, 
  headerRightContent,
  linkToHome = true,
  containerClassName = "",
  fullHeight = false,
  outsideContent,
  footer = 'none'
}: AppLayoutProps) => {
  return (
    <div className={`min-h-screen bg-background ${fullHeight ? "flex flex-col" : ""}`}>
      <AppHeader rightContent={headerRightContent} linkToHome={linkToHome} />
      
      <main className={`container mx-auto px-4 py-8 ${fullHeight ? "flex-1 flex flex-col" : ""} ${containerClassName}`}>
        {children}
      </main>

      {footer === 'full' && <Footer />}
      {footer === 'minimal' && <MinimalFooter />}
      {outsideContent}
    </div>
  );
};

export default AppLayout;
