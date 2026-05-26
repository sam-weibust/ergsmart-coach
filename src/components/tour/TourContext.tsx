import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TourStep, TourRole, getTourForRole } from "./tourData";

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  steps: TourStep[];
  tourId: TourRole | null;
  startTour: (role: string | null, userId: string) => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  showWelcomeModal: boolean;
  dismissWelcomeModal: () => void;
  acceptWelcome: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

interface Props {
  children: ReactNode;
  profile: any;
  onNavTo?: (section: string, sub?: string) => void;
}

const ALLOWED_TOUR_IDS: TourRole[] = ["athlete", "coach", "coxswain"];

export function TourProvider({ children, profile, onNavTo }: Props) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [tourId, setTourId] = useState<TourRole | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const saveProgress = useCallback(async (opts: {
    completedSteps?: number[];
    completed?: boolean;
    skipped?: boolean;
    completedAt?: string;
  }) => {
    const userId = userIdRef.current;
    if (!userId || !tourId) return;
    if (!ALLOWED_TOUR_IDS.includes(tourId)) return;

    // Verify session before writing
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== userId) return;

    await supabase.from("user_tour_progress").upsert({
      user_id: userId,
      tour_id: tourId,
      completed_steps: opts.completedSteps ?? [],
      completed: opts.completed ?? false,
      skipped: opts.skipped ?? false,
      started_at: new Date().toISOString(),
      completed_at: opts.completedAt ?? null,
    }, { onConflict: "user_id,tour_id" });
  }, [tourId]);

  // Check if tour should auto-trigger on profile load
  useEffect(() => {
    if (!profile?.id) return;
    userIdRef.current = profile.id;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.id !== profile.id) return;

      const role: string | null = (profile as any)?.user_type ?? (profile as any)?.role ?? null;
      const { tourId: tid } = getTourForRole(role);

      const { data } = await supabase
        .from("user_tour_progress")
        .select("completed, skipped, started_at")
        .eq("user_id", profile.id)
        .eq("tour_id", tid)
        .maybeSingle();

      // Only auto-show if never seen before
      if (!data) setShowWelcomeModal(true);
    };

    check();
  }, [profile?.id]);

  const startTour = useCallback(async (role: string | null, userId: string) => {
    const { tourId: tid, steps: s } = getTourForRole(role);
    userIdRef.current = userId;
    setTourId(tid);
    setSteps(s);
    setCurrentStep(0);
    setIsActive(true);
    setShowWelcomeModal(false);

    await saveProgress({ completedSteps: [], completed: false, skipped: false });

    if (s[0]?.navTo && onNavTo) {
      onNavTo(s[0].navTo.section, s[0].navTo.sub);
    }
  }, [saveProgress, onNavTo]);

  const nextStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = prev + 1;
      const step = steps[next];
      if (step?.navTo && onNavTo) {
        onNavTo(step.navTo.section, step.navTo.sub);
      }
      saveProgress({ completedSteps: Array.from({ length: next }, (_, i) => i) });
      return next;
    });
  }, [steps, onNavTo, saveProgress]);

  const prevStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = Math.max(0, prev - 1);
      const step = steps[next];
      if (step?.navTo && onNavTo) {
        onNavTo(step.navTo.section, step.navTo.sub);
      }
      return next;
    });
  }, [steps, onNavTo]);

  const skipTour = useCallback(async () => {
    setIsActive(false);
    setShowWelcomeModal(false);
    await saveProgress({ skipped: true });
  }, [saveProgress]);

  const completeTour = useCallback(async () => {
    setIsActive(false);
    await saveProgress({
      completedSteps: steps.map((_, i) => i),
      completed: true,
      completedAt: new Date().toISOString(),
    });
  }, [steps, saveProgress]);

  const dismissWelcomeModal = useCallback(async () => {
    setShowWelcomeModal(false);
    const role: string | null = (profile as any)?.user_type ?? (profile as any)?.role ?? null;
    const { tourId: tid } = getTourForRole(role);
    const userId = userIdRef.current;
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== userId) return;
    await supabase.from("user_tour_progress").upsert({
      user_id: userId,
      tour_id: tid,
      completed_steps: [],
      completed: false,
      skipped: true,
      started_at: new Date().toISOString(),
    }, { onConflict: "user_id,tour_id" });
  }, [profile]);

  const acceptWelcome = useCallback(() => {
    const role: string | null = (profile as any)?.user_type ?? (profile as any)?.role ?? null;
    const userId = userIdRef.current ?? profile?.id;
    if (userId) startTour(role, userId);
  }, [profile, startTour]);

  return (
    <TourContext.Provider value={{
      isActive, currentStep, steps, tourId, startTour, nextStep, prevStep,
      skipTour, completeTour, showWelcomeModal, dismissWelcomeModal, acceptWelcome,
    }}>
      {children}
    </TourContext.Provider>
  );
}
