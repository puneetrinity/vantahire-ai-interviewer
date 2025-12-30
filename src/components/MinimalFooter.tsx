const MinimalFooter = () => {
  return (
    <footer className="py-6 border-t border-border bg-background">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          © {new Date().getFullYear()} Vantahire. All rights reserved.
        </p>
        <div className="flex items-center gap-4 text-sm">
          <a 
            href="https://vantahire.com/privacy" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy
          </a>
          <a 
            href="https://vantahire.com/terms" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms
          </a>
          <a 
            href="https://vantahire.com/help" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Help
          </a>
        </div>
      </div>
    </footer>
  );
};

export default MinimalFooter;
