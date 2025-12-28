import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import APIPreview from "@/components/APIPreview";
import Dashboard from "@/components/Dashboard";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <APIPreview />
      <Dashboard />
      <Pricing />
      <Footer />
    </main>
  );
};

export default Index;
