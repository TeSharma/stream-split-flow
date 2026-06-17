CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = _user_id
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = _team_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_team_role(_team_id uuid, _user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = _user_id
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = _team_id AND user_id = auth.uid() AND role = _role
    );
$$;