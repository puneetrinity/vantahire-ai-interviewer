import vantahireLogo from "@/assets/vantahire-logo.jpg";

const Footer = () => {
  const links = {
    Product: ["Features", "API", "Pricing", "Integrations", "Changelog"],
    Company: ["About", "Blog", "Careers", "Press Kit"],
    Resources: ["Documentation", "API Reference", "SDKs", "Status"],
    Legal: ["Privacy", "Terms", "Security", "GDPR"],
  };

  return (
    <footer className="py-16 bg-foreground text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-5 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="/" className="flex items-center gap-2 mb-4">
              <img src={vantahireLogo} alt="VantaHire" className="w-9 h-9 rounded-lg object-cover" />
              <span className="text-xl font-bold">VantaHire</span>
            </a>
            <p className="text-primary-foreground/60 text-sm">
              AI-powered interviews that integrate seamlessly with your ATS.
            </p>
          </div>

          {/* Links */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4">{category}</h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm"
                    >
                      {item}
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
            © 2024 VantaHire. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm">
              Twitter
            </a>
            <a href="#" className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm">
              LinkedIn
            </a>
            <a href="#" className="text-primary-foreground/60 hover:text-primary-foreground transition-colors text-sm">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
