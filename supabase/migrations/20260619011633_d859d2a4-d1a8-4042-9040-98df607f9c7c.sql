ALTER TABLE public.streams
  ADD COLUMN IF NOT EXISTS ghost_content_api_key text,
  ADD COLUMN IF NOT EXISTS ghost_last_sync_at timestamptz;