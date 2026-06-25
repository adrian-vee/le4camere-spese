-- Log invii report HR
CREATE TABLE IF NOT EXISTS public.hr_report_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  staff_id UUID REFERENCES public.profiles(id),
  staff_name TEXT,
  staff_type TEXT,
  total_hours NUMERIC(10,2),
  worked_hours NUMERIC(10,2),
  leave_hours NUMERIC(10,2),
  amount NUMERIC(10,2),
  report_type TEXT DEFAULT 'initial',
  sent_at TIMESTAMPTZ DEFAULT now(),
  email_sent_to TEXT
);

ALTER TABLE public.hr_report_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_hr_logs" ON public.hr_report_logs
  FOR ALL USING (true) WITH CHECK (true);
