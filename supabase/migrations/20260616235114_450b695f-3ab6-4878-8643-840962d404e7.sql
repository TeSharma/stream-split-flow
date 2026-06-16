
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_team() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_team_role(UUID, UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_team_role(UUID, UUID, public.app_role) TO authenticated, service_role;
