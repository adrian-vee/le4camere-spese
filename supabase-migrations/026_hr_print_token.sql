-- Token per accesso stampa report HR senza login
ALTER TABLE public.hr_report_logs
  ADD COLUMN IF NOT EXISTS print_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS print_token_expires TIMESTAMPTZ DEFAULT (now() + INTERVAL '90 days'),
  ADD COLUMN IF NOT EXISTS staff_table_id UUID;

CREATE INDEX IF NOT EXISTS idx_hr_report_logs_print_token ON public.hr_report_logs(print_token);
