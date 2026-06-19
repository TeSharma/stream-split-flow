
-- 1) Column-level lockdown: sensitive PII / secrets are no longer
--    readable by the `authenticated` role through the Data API. Code
--    that needs them must go through the service-role admin client
--    after verifying the caller is an owner.
REVOKE SELECT (subscriber_email) ON public.payment_events FROM authenticated;
REVOKE SELECT (webhook_secret, ghost_content_api_key) ON public.streams FROM authenticated;

-- 2) Realtime: lock down channel subscriptions. Without a policy on
--    realtime.messages, ANY authenticated user could subscribe to any
--    topic. Restrict to authenticated callers AND to the small set of
--    channel topics this app actually uses. Row payload data is
--    additionally filtered by the underlying table's RLS.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "splitai authenticated channel subscriptions" ON realtime.messages;
CREATE POLICY "splitai authenticated channel subscriptions"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- Only the app's known channel names. Payload row visibility is
    -- still enforced by RLS on the underlying tables.
    (SELECT realtime.topic()) IN (
      'payouts-live',
      'payments-live',
      'split-proposals-live'
    )
  );
