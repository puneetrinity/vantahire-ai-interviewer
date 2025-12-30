const Footer = () => {
  const links = {
    Product: [
      { name: "Features", href: "#features" },
      { name: "How It Works", href: "#how-it-works" },
      { name: "Pricing", href: "#pricing" },
      { name: "API", href: "#api" },
    ],
    Company: [
      { name: "About Vantahire", href: "https://vantahire.com/about" },
      { name: "Blog", href: "https://vantahire.com/blog" },
      { name: "Careers", href: "https://vantahire.com/careers" },
      { name: "Contact", href: "https://vantahire.com/contact" },
    ],
    Resources: [
      { name: "Documentation", href: "https://vantahire.com/docs" },
      { name: "Help Center", href: "https://vantahire.com/help" },
      { name: "Brand Guidelines", href: "https://vantahire.com/brand" },
      { name: "Status", href: "https://status.vantahire.com" },
    ],
    Legal: [
      { name: "Privacy Policy", href: "https://vantahire.com/privacy" },
      { name: "Terms of Service", href: "https://vantahire.com/terms" },
      { name: "Security", href: "https://vantahire.com/security" },
    ],
  };

  return (
    <footer className="py-16 bg-foreground text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-5 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="/" className="flex items-center gap-2 mb-4">
              <img 
                src="/vantahire-logo-2026.jpg" 
                alt="Vantahire" 
                className="w-9 h-9 rounded-lg object-cover" 
              />
              <span className="text-xl font-bold">Vantahire AI Interview</span>
            </a>
            <p className="text-primary-foreground/60 text-sm mb-4">
              AI-powered interviews that integrate seamlessly with Vantahire ATS.
            </p>
            <p className="text-primary-foreground/40 text-xs">
              Powered by Vantahire ATS
            </p>
          </div>

          {/* Links */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4">{category}</h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm"
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-primary-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-primary-foreground/60 text-sm">
            © {new Date().getFullYear()} Vantahire. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a 
              href="https://twitter.com/vantahire" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm"
            >
              Twitter
            </a>
            <a 
              href="https://linkedin.com/company/vantahire" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm"
            >
              LinkedIn
            </a>
            <a 
              href="https://vantahire.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm"
            >
              Vantahire.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
