import { motion } from "framer-motion";
import { 
  Users, 
  Calendar, 
  TrendingUp, 
  Clock,
  ChevronRight,
  MoreHorizontal,
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";

const stats = [
  { label: "Active Interviews", value: "24", icon: Play, trend: "+12%" },
  { label: "Candidates This Week", value: "156", icon: Users, trend: "+8%" },
  { label: "Avg. Score", value: "7.4", icon: TrendingUp, trend: "+0.3" },
  { label: "Avg. Duration", value: "23min", icon: Clock, trend: "-2min" },
];

const recentInterviews = [
  { name: "Sarah Chen", role: "Frontend Engineer", score: 8.5, status: "completed", time: "2h ago" },
  { name: "Michael Brown", role: "Product Manager", score: 7.2, status: "completed", time: "4h ago" },
  { name: "Emily Davis", role: "UX Designer", score: null, status: "in_progress", time: "now" },
  { name: "James Wilson", role: "Backend Engineer", score: null, status: "scheduled", time: "in 1h" },
];

const Dashboard = () => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-accent/20 text-accent";
      case "in_progress": return "bg-primary/20 text-primary";
      case "scheduled": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Completed";
      case "in_progress": return "In Progress";
      case "scheduled": return "Scheduled";
      default: return status;
    }
  };

  return (
    <section className="py-24 gradient-hero">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            Powerful <span className="gradient-text">Dashboard</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Monitor interviews, track candidate progress, and gain insights all in one place.
          </p>
        </motion.div>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-6xl mx-auto"
        >
          <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden">
            {/* Dashboard Header */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-foreground">Interview Dashboard</h3>
                <p className="text-sm text-muted-foreground">Overview of your hiring pipeline</p>
              </div>
              <Button variant="default" size="sm">
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Interview
              </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-border">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className={`p-6 ${index < stats.length - 1 ? "border-r border-border" : ""}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-accent">{stat.trend}</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground mb-1">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Recent Interviews */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-foreground">Recent Interviews</h4>
                <button className="text-sm text-primary hover:underline flex items-center gap-1">
                  View All <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {recentInterviews.map((interview, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-primary-foreground font-semibold">
                        {interview.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{interview.name}</div>
                        <div className="text-sm text-muted-foreground">{interview.role}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {interview.score && (
                        <div className="text-right">
                          <div className="font-semibold text-foreground">{interview.score}/10</div>
                          <div className="text-xs text-muted-foreground">Score</div>
                        </div>
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}>
                        {getStatusLabel(interview.status)}
                      </span>
                      <span className="text-sm text-muted-foreground min-w-[60px] text-right">
                        {interview.time}
                      </span>
                      <button className="text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Dashboard;
