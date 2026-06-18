
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS circle_tx_id text,
  ADD COLUMN IF NOT EXISTS destination_address text;

ALTER TABLE public.payouts REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payouts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
