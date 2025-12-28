import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";

const codeExample = `// Create an interview session
const interview = await fetch('/api/v1/interviews', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    candidate_email: 'candidate@example.com',
    job_role: 'Senior Software Engineer',
    questions: ['technical', 'behavioral'],
    webhook_url: 'https://your-ats.com/webhook'
  })
});

// Response
{
  "interview_id": "int_abc123",
  "interview_url": "https://interview.ai/s/abc123",
  "status": "pending",
  "expires_at": "2024-01-15T00:00:00Z"
}`;

const APIPreview = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="api" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
              Developer-First <span className="gradient-text">API</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Clean, RESTful endpoints with comprehensive documentation. 
              Webhooks for real-time updates. SDKs for major languages.
            </p>

            <div className="space-y-4 mb-8">
              {[
                "RESTful API with OpenAPI specification",
                "Real-time webhooks for interview events",
                "Official SDKs for Node.js, Python, Ruby",
                "OAuth 2.0 authentication",
                "Rate limiting with generous quotas",
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full gradient-bg flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                  <span className="text-foreground">{feature}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <Button variant="hero">
                View API Docs
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button variant="hero-outline">
                Get API Key
              </Button>
            </div>
          </motion.div>

          {/* Code Preview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="rounded-2xl bg-foreground/95 overflow-hidden shadow-card">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-foreground border-b border-muted-foreground/20">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive/80" />
                  <div className="w-3 h-3 rounded-full bg-accent/80" />
                  <div className="w-3 h-3 rounded-full bg-primary/80" />
                </div>
                <button
                  onClick={handleCopy}
                  className="text-muted-foreground/60 hover:text-primary-foreground transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-accent" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Code */}
              <pre className="p-6 overflow-x-auto text-sm">
                <code className="text-primary-foreground/90 font-mono">
                  {codeExample}
                </code>
              </pre>
            </div>

            {/* Decorative Element */}
            <div className="absolute -z-10 -bottom-4 -right-4 w-full h-full rounded-2xl gradient-bg opacity-20" />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default APIPreview;
