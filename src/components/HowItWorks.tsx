import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Connect Your ATS",
    description: "Integrate our API with your existing applicant tracking system using our SDK or REST endpoints.",
    color: "from-primary to-accent",
  },
  {
    number: "02",
    title: "Configure Interview",
    description: "Set up custom questions, evaluation criteria, and role-specific assessments through our dashboard.",
    color: "from-accent to-primary",
  },
  {
    number: "03",
    title: "Invite Candidates",
    description: "Candidates receive a personalized link and can complete their AI interview at their convenience.",
    color: "from-primary to-accent",
  },
  {
    number: "04",
    title: "Review & Decide",
    description: "Get instant analysis, scores, and recommendations pushed directly to your ATS pipeline.",
    color: "from-accent to-primary",
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 gradient-hero">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            Simple <span className="gradient-text">Integration</span>, Powerful Results
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get up and running in under an hour with our developer-friendly API.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="relative group"
              >
                <div className="p-8 rounded-2xl bg-card border border-border shadow-card hover:shadow-soft transition-all duration-300">
                  {/* Step Number */}
                  <div className={`inline-block text-5xl font-bold bg-gradient-to-r ${step.color} bg-clip-text text-transparent mb-4`}>
                    {step.number}
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>

                  {/* Arrow for non-last items */}
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                      <ArrowRight className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
