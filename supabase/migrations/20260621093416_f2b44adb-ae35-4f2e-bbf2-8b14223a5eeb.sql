
-- 1) Lock down sensitive columns via explicit column-level grants
GRANT SELECT (id, stream_id, ghost_event_id, ghost_subscription_id, amount_cents, currency, status, received_at, idempotency_key) ON public.payment_events TO authenticated;
REVOKE SELECT (subscriber_email) ON public.payment_events FROM authenticated;
REVOKE SELECT (subscriber_email) ON public.payment_events FROM anon;

GRANT SELECT (id, team_id, name, source, ghost_site_url, status, created_at, ghost_last_sync_at) ON public.streams TO authenticated;
REVOKE SELECT (webhook_secret, ghost_content_api_key) ON public.streams FROM authenticated;
REVOKE SELECT (webhook_secret, ghost_content_api_key) ON public.streams FROM anon;

-- 2) Fix privilege escalation: only team owners may insert memberships
DROP POLICY IF EXISTS "owners insert memberships" ON public.team_members;
CREATE POLICY "owners insert memberships"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()
  )
);

-- 3) Scope realtime subscriptions to per-team topics and verify membership
DROP POLICY IF EXISTS "splitai authenticated channel subscriptions" ON realtime.messages;
CREATE POLICY "splitai authenticated channel subscriptions"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND (
        (SELECT realtime.topic()) = 'payouts-team-'   || tm.team_id::text OR
        (SELECT realtime.topic()) = 'payments-team-'  || tm.team_id::text OR
        (SELECT realtime.topic()) = 'proposals-team-' || tm.team_id::text
      )
  )
);
