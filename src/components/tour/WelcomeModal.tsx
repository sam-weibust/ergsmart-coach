import { useTour } from "./TourContext";
import { Button } from "@/components/ui/button";

export function WelcomeModal() {
  const { showWelcomeModal, dismissWelcomeModal, acceptWelcome } = useTour();
  if (!showWelcomeModal) return null;

  return (
    <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95">
        <div className="h-1.5 bg-[#0ea5e9]" />
        <div className="p-6 text-center">
          <div className="text-4xl mb-3">🚣</div>
          <h2 className="text-2xl font-bold mb-2">Welcome to CrewSync</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Take a quick 2-minute tour to see what the app can do.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
              onClick={acceptWelcome}
            >
              Show Me Around
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={dismissWelcomeModal}
            >
              Skip for Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
