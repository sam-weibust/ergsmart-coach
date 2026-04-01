
CREATE TABLE public.recovery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  body_region TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity >= 1 AND severity <= 5),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recovery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recovery logs" ON public.recovery_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own recovery logs" ON public.recovery_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own recovery logs" ON public.recovery_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recovery logs" ON public.recovery_logs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_recovery_logs_updated_at BEFORE UPDATE ON public.recovery_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
