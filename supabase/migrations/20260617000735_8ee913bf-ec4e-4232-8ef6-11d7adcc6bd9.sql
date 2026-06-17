DROP POLICY IF EXISTS "members view their teams" ON public.teams;

CREATE POLICY "owners and members can view teams"
ON public.teams
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_team_member(id, auth.uid())
);