import { motion } from "framer-motion";
import { 
  Brain, 
  Zap, 
  Shield, 
  BarChart3, 
  Globe, 
  Code2,
  MessageSquare,
  Clock
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Analysis",
    description: "Advanced NLP evaluates responses for skills, communication, and cultural fit in real-time.",
  },
  {
    icon: Code2,
    title: "RESTful API",
    description: "Simple, well-documented API endpoints for seamless ATS integration in minutes.",
  },
  {
    icon: MessageSquare,
    title: "Natural Conversations",
    description: "Human-like dialogue that adapts to candidate responses and digs deeper when needed.",
  },
  {
    icon: Clock,
    title: "24/7 Availability",
    description: "Candidates can interview anytime, anywhere. No scheduling conflicts ever.",
  },
  {
    icon: Shield,
    title: "Bias-Free Evaluation",
    description: "Consistent, objective assessments that focus purely on skills and qualifications.",
  },
  {
    icon: BarChart3,
    title: "Rich Analytics",
    description: "Detailed scoring, sentiment analysis, and comparison dashboards for each candidate.",
  },
  {
    icon: Globe,
    title: "Multi-Language",
    description: "Support for 50+ languages to interview diverse global talent pools.",
  },
  {
    icon: Zap,
    title: "Instant Results",
    description: "Get comprehensive candidate reports delivered to your ATS in seconds.",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            Everything You Need to{" "}
            <span className="gradient-text">Hire Smarter</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A complete AI interview solution designed from the ground up for modern recruiting teams.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group p-6 rounded-2xl bg-card border border-border hover:shadow-card transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center mb-4 group-hover:shadow-glow transition-shadow">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
