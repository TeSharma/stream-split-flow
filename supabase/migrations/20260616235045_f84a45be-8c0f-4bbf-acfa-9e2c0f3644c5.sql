
-- =========== profiles ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable to authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== roles ===========
CREATE TYPE public.app_role AS ENUM ('owner', 'member');

-- =========== teams ===========
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- =========== team_members ===========
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- security-definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_team_role(_team_id UUID, _user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND role = _role
  );
$$;

-- teams policies
CREATE POLICY "members view their teams" ON public.teams FOR SELECT TO authenticated
  USING (public.is_team_member(id, auth.uid()));
CREATE POLICY "users create teams they own" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owners update team" ON public.teams FOR UPDATE TO authenticated
  USING (public.has_team_role(id, auth.uid(), 'owner'))
  WITH CHECK (public.has_team_role(id, auth.uid(), 'owner'));
CREATE POLICY "owners delete team" ON public.teams FOR DELETE TO authenticated
  USING (public.has_team_role(id, auth.uid(), 'owner'));

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- team_members policies
CREATE POLICY "members view team_members of their teams" ON public.team_members FOR SELECT TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "owners insert team_members" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.has_team_role(team_id, auth.uid(), 'owner') OR auth.uid() = user_id);
CREATE POLICY "owners delete team_members" ON public.team_members FOR DELETE TO authenticated
  USING (public.has_team_role(team_id, auth.uid(), 'owner'));

-- Auto-add owner as member when team created
CREATE OR REPLACE FUNCTION public.handle_new_team()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_team_created
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_team();

-- =========== contributors ===========
CREATE TABLE public.contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  wallet_address TEXT,
  role TEXT NOT NULL DEFAULT 'writer',
  ghost_author_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contributors TO authenticated;
GRANT ALL ON public.contributors TO service_role;
ALTER TABLE public.contributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members manage contributors" ON public.contributors FOR ALL TO authenticated
  USING (public.is_team_member(team_id, auth.uid()))
  WITH CHECK (public.is_team_member(team_id, auth.uid()));

-- =========== streams ===========
CREATE TABLE public.streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ghost',
  ghost_site_url TEXT,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.streams TO authenticated;
GRANT ALL ON public.streams TO service_role;
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view streams" ON public.streams FOR SELECT TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));
CREATE POLICY "team owners insert streams" ON public.streams FOR INSERT TO authenticated
  WITH CHECK (public.has_team_role(team_id, auth.uid(), 'owner'));
CREATE POLICY "team owners update streams" ON public.streams FOR UPDATE TO authenticated
  USING (public.has_team_role(team_id, auth.uid(), 'owner'))
  WITH CHECK (public.has_team_role(team_id, auth.uid(), 'owner'));
CREATE POLICY "team owners delete streams" ON public.streams FOR DELETE TO authenticated
  USING (public.has_team_role(team_id, auth.uid(), 'owner'));

-- =========== content_items ===========
CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('article','edit','asset')),
  title TEXT NOT NULL,
  body_excerpt TEXT,
  ghost_post_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members manage content" ON public.content_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.streams s WHERE s.id = stream_id AND public.is_team_member(s.team_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.streams s WHERE s.id = stream_id AND public.is_team_member(s.team_id, auth.uid())));

-- =========== payment_events ===========
CREATE TABLE public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE CASCADE,
  ghost_event_id TEXT,
  ghost_subscription_id TEXT,
  subscriber_email TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT UNIQUE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view payments" ON public.payment_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.streams s WHERE s.id = stream_id AND public.is_team_member(s.team_id, auth.uid())));
-- Inserts/updates happen via service_role (webhook + server fns).

-- =========== split_proposals ===========
CREATE TABLE public.split_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_event_id UUID NOT NULL UNIQUE REFERENCES public.payment_events(id) ON DELETE CASCADE,
  ai_percentages JSONB NOT NULL,
  ai_rationale TEXT,
  approved_percentages JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.split_proposals TO authenticated;
GRANT ALL ON public.split_proposals TO service_role;
ALTER TABLE public.split_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view proposals" ON public.split_proposals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    WHERE pe.id = payment_event_id AND public.is_team_member(s.team_id, auth.uid())
  ));
CREATE POLICY "team members update proposals" ON public.split_proposals FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    WHERE pe.id = payment_event_id AND public.is_team_member(s.team_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    WHERE pe.id = payment_event_id AND public.is_team_member(s.team_id, auth.uid())
  ));

-- =========== payouts ===========
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_event_id UUID NOT NULL REFERENCES public.payment_events(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  amount_usdc NUMERIC(20, 6) NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_event_id, contributor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team members view payouts" ON public.payouts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_events pe
    JOIN public.streams s ON s.id = pe.stream_id
    WHERE pe.id = payment_event_id AND public.is_team_member(s.team_id, auth.uid())
  ));

-- =========== realtime ===========
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.split_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payouts;
