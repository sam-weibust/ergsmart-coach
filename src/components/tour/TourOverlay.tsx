import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useTour } from "./TourContext";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import confetti from "canvas-confetti";

interface SpotRect { top: number; left: number; width: number; height: number; }

function useSpotlight(targetId: string): SpotRect | null {
  const [rect, setRect] = useState<SpotRect | null>(null);

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(`[data-tour-id="${targetId}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const t = setTimeout(update, 150); // re-measure after nav transition
    window.addEventListener("resize", update);
    return () => { clearTimeout(t); window.removeEventListener("resize", update); };
  }, [targetId]);

  return rect;
}

function CompletionScreen({ onClose }: { onClose: () => void }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const end = Date.now() + 2000;
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#0ea5e9", "#6366f1", "#22c55e"] });
      confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#f59e0b", "#ec4899", "#0ea5e9"] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    setTimeout(onClose, 2500);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center animate-in zoom-in-95">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
        <p className="text-muted-foreground">Welcome to CrewSync. Let's go.</p>
      </div>
    </div>
  );
}

export function TourOverlay() {
  const { isActive, currentStep, steps, nextStep, prevStep, skipTour, completeTour } = useTour();
  const [showCompletion, setShowCompletion] = useState(false);

  const step = steps[currentStep];
  const spotRect = useSpotlight(step?.targetId ?? "");
  const isLast = currentStep === steps.length - 1;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const handleNext = useCallback(() => {
    if (isLast) {
      setShowCompletion(true);
      completeTour();
    } else {
      nextStep();
    }
  }, [isLast, nextStep, completeTour]);

  const handleCompletionClose = useCallback(() => {
    setShowCompletion(false);
  }, []);

  if (!isActive || !step) return null;
  if (showCompletion) return <CompletionScreen onClose={handleCompletionClose} />;

  const PADDING = 8;
  const spotTop = spotRect ? spotRect.top - PADDING : -100;
  const spotLeft = spotRect ? spotRect.left - PADDING : -100;
  const spotW = spotRect ? spotRect.width + PADDING * 2 : 0;
  const spotH = spotRect ? spotRect.height + PADDING * 2 : 0;

  const progress = ((currentStep + 1) / steps.length) * 100;

  // Tooltip position
  let tooltipStyle: React.CSSProperties = {};
  if (isMobile || !spotRect) {
    tooltipStyle = { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 48px)", maxWidth: 360 };
  } else {
    // Try below element, fall back to above
    const below = spotTop + spotH + 12;
    const above = spotTop - 280;
    tooltipStyle = {
      position: "fixed",
      left: Math.max(8, Math.min(spotLeft, window.innerWidth - 360 - 8)),
      top: below + 280 < window.innerHeight ? below : Math.max(8, above),
      width: 320,
    };
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9990] pointer-events-none"
        style={{
          background: spotRect
            ? `radial-gradient(ellipse ${spotW + 40}px ${spotH + 40}px at ${spotLeft + spotW / 2}px ${spotTop + spotH / 2}px, transparent 70%, rgba(0,0,0,0.75) 100%)`
            : "rgba(0,0,0,0.75)",
        }}
      />

      {/* Click-blocker backdrop (captures clicks outside spotlight) */}
      <div
        className="fixed inset-0 z-[9991]"
        onClick={e => e.stopPropagation()}
        style={{ cursor: "default" }}
      >
        {/* Spotlight hole — pointer events passthrough */}
        {spotRect && (
          <div
            style={{
              position: "absolute",
              top: spotTop,
              left: spotLeft,
              width: spotW,
              height: spotH,
              borderRadius: 10,
              boxShadow: "0 0 0 4px #0ea5e9, 0 0 20px 4px rgba(14,165,233,0.4)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Tooltip card */}
      <div
        className="z-[9999] shadow-2xl rounded-2xl overflow-hidden"
        style={tooltipStyle}
      >
        {/* Accent bar */}
        <div className="h-1.5 bg-[#0ea5e9] w-full" />

        <div className="bg-white dark:bg-gray-900 p-5">
          {/* Header row */}
          <div className="flex items-start justify-between mb-1">
            <span className="text-xs text-muted-foreground font-medium">
              Step {currentStep + 1} of {steps.length}
            </span>
            <button
              onClick={skipTour}
              className="text-muted-foreground hover:text-foreground transition-colors ml-2"
              aria-label="Close tour"
            >
              <X size={16} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full mb-3">
            <div
              className="h-1 rounded-full bg-[#0ea5e9] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <h3 className="text-lg font-bold mb-1.5">{step.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={skipTour}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip Tour
            </button>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button variant="outline" size="sm" onClick={prevStep} className="gap-1">
                  <ChevronLeft size={14} /> Prev
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                className="gap-1 bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
              >
                {isLast ? "Done 🎉" : <>Next <ChevronRight size={14} /></>}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
