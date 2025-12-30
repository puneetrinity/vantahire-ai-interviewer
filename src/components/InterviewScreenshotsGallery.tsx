import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, ChevronLeft, ChevronRight, X, Loader2, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface Screenshot {
  name: string;
  url: string;
  timestamp: string;
}

interface InterviewScreenshotsGalleryProps {
  interviewId: string;
}

export default function InterviewScreenshotsGallery({ interviewId }: InterviewScreenshotsGalleryProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchScreenshots = async () => {
      setLoading(true);
      try {
        // List all files in the interview folder
        const { data: files, error } = await supabase.storage
          .from("interview-documents")
          .list(interviewId, {
            limit: 100,
            sortBy: { column: "name", order: "asc" },
          });

        if (error) {
          console.error("Error fetching screenshots:", error);
          setScreenshots([]);
          return;
        }

        // Filter for screenshot files only
        const screenshotFiles = (files || []).filter(
          (file) => file.name.startsWith("screenshot-") && file.name.endsWith(".jpg")
        );

        if (screenshotFiles.length === 0) {
          setScreenshots([]);
          return;
        }

        // Get signed URLs for each screenshot
        const screenshotsWithUrls: Screenshot[] = await Promise.all(
          screenshotFiles.map(async (file) => {
            const filePath = `${interviewId}/${file.name}`;
            const { data: signedUrlData } = await supabase.storage
              .from("interview-documents")
              .createSignedUrl(filePath, 60 * 60); // 1 hour expiration

            // Extract timestamp from filename (screenshot-1-1234567890.jpg)
            const timestampMatch = file.name.match(/screenshot-\d+-(\d+)\.jpg/);
            const timestamp = timestampMatch 
              ? new Date(parseInt(timestampMatch[1])).toLocaleString()
              : "Unknown time";

            return {
              name: file.name,
              url: signedUrlData?.signedUrl || "",
              timestamp,
            };
          })
        );

        setScreenshots(screenshotsWithUrls.filter((s) => s.url));
      } catch (err) {
        console.error("Error loading screenshots:", err);
        setScreenshots([]);
      } finally {
        setLoading(false);
      }
    };

    if (interviewId) {
      fetchScreenshots();
    }
  }, [interviewId]);

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
  };

  const closeLightbox = () => {
    setSelectedIndex(null);
  };

  const goToPrevious = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const goToNext = () => {
    if (selectedIndex !== null && selectedIndex < screenshots.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-card rounded-xl border border-border">
        <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Camera className="w-4 h-4" /> Interview Screenshots
        </h4>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="p-4 bg-card rounded-xl border border-border">
        <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Camera className="w-4 h-4" /> Interview Screenshots
        </h4>
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <ImageOff className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No screenshots available for this interview.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 bg-card rounded-xl border border-border">
        <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Camera className="w-4 h-4" /> Interview Screenshots
          <span className="text-xs text-muted-foreground font-normal">
            ({screenshots.length} captured)
          </span>
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {screenshots.map((screenshot, index) => (
            <button
              key={screenshot.name}
              onClick={() => openLightbox(index)}
              className="relative aspect-video rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors group"
            >
              <img
                src={screenshot.url}
                alt={`Screenshot ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                  View
                </span>
              </div>
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white">
                #{index + 1}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={selectedIndex !== null} onOpenChange={closeLightbox}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <div className="relative">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeLightbox}
              className="absolute top-2 right-2 z-10 text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </Button>

            {/* Navigation buttons */}
            {selectedIndex !== null && selectedIndex > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}
            {selectedIndex !== null && selectedIndex < screenshots.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            )}

            {/* Image */}
            {selectedIndex !== null && (
              <div className="flex flex-col items-center p-4">
                <img
                  src={screenshots[selectedIndex].url}
                  alt={`Screenshot ${selectedIndex + 1}`}
                  className="max-h-[70vh] w-auto rounded-lg"
                />
                <div className="mt-4 text-center text-white">
                  <p className="text-sm font-medium">
                    Screenshot {selectedIndex + 1} of {screenshots.length}
                  </p>
                  <p className="text-xs text-white/60 mt-1">
                    {screenshots[selectedIndex].timestamp}
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
