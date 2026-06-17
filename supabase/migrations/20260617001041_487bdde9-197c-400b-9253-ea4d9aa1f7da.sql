DROP POLICY IF EXISTS "team members manage content" ON public.content_items;
DROP POLICY IF EXISTS "team members manage contributors" ON public.contributors;
DROP POLICY IF EXISTS "team members view payments" ON public.payment_events;
DROP POLICY IF EXISTS "team members view payouts" ON public.payouts;
DROP POLICY IF EXISTS "team members update proposals" ON public.split_proposals;
DROP POLICY IF EXISTS "team members view proposals" ON public.split_proposals;
DROP POLICY IF EXISTS "team members view streams" ON public.streams;
DROP POLICY IF EXISTS "team owners delete streams" ON public.streams;
DROP POLICY IF EXISTS "team owners insert streams" ON public.streams;
DROP POLICY IF EXISTS "team owners update streams" ON public.streams;
DROP POLICY IF EXISTS "members view team_members of their teams" ON public.team_members;
DROP POLICY IF EXISTS "owners delete team_members" ON public.team_members;
DROP POLICY IF EXISTS "owners insert team_members" ON public.team_members;
DROP POLICY IF EXISTS "owners and members can view teams" ON public.teams;
DROP POLICY IF EXISTS "owners delete team" ON public.teams;
DROP POLICY IF EXISTS "owners update team" ON public.teams;

CREATE POLICY "members manage content"
ON public.content_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.streams s
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE s.id = content_items.stream_id
      AND tm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.streams s
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE s.id = content_items.stream_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "members manage contributors"
ON public.contributors
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = contributors.team_id
      AND tm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = contributors.team_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "members view payments"
ON public.payment_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.streams s
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE s.id = payment_events.stream_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "members view payouts"
ON public.payouts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE pe.id = payouts.payment_event_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "members view proposals"
ON public.split_proposals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE pe.id = split_proposals.payment_event_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "members update proposals"
ON public.split_proposals
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE pe.id = split_proposals.payment_event_id
      AND tm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE pe.id = split_proposals.payment_event_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "members view streams"
ON public.streams
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = streams.team_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "owners insert streams"
ON public.streams
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = streams.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'owner'
  )
);

CREATE POLICY "owners update streams"
ON public.streams
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = streams.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = streams.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'owner'
  )
);

CREATE POLICY "owners delete streams"
ON public.streams
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = streams.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'owner'
  )
);

CREATE POLICY "members view own memberships"
ON public.team_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "owners insert memberships"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_members.team_id
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "owners delete memberships"
ON public.team_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_members.team_id
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "owners and members view teams"
ON public.teams
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = teams.id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "owners update teams"
ON public.teams
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owners delete teams"
ON public.teams
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());