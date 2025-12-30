import { motion } from "framer-motion";

interface AudioWaveformProps {
  isActive: boolean;
  barCount?: number;
  className?: string;
}

const AudioWaveform = ({ isActive, barCount = 5, className = "" }: AudioWaveformProps) => {
  const bars = Array.from({ length: barCount }, (_, i) => i);
  
  return (
    <div className={`flex items-center justify-center gap-1 h-8 ${className}`}>
      {bars.map((i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-primary"
          initial={{ height: 4 }}
          animate={isActive ? {
            height: [4, 16 + Math.random() * 16, 8, 24 + Math.random() * 8, 4],
          } : { height: 4 }}
          transition={isActive ? {
            duration: 0.8 + Math.random() * 0.4,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
            delay: i * 0.1,
          } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
};

export default AudioWaveform;
