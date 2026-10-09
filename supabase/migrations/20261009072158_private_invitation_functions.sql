-- Keep the elevated invitation functions out of the public API schema.
--
-- preview_invitation and accept_member_invitation must run with elevated rights
-- (they read invitations and auth.users that the caller cannot see). Supabase
-- recommends keeping SECURITY DEFINER functions in a schema that the REST API
-- does not expose and calling them through thin SECURITY INVOKER wrappers. The
-- behaviour is unchanged; the API surface is smaller and the security advisor
-- no longer flags the functions.

alter function public.preview_invitation(text) set schema private;
alter function public.accept_member_invitation(text) set schema private;

revoke all on function private.preview_invitation(text) from public;
revoke all on function private.accept_member_invitation(text) from public, anon;
grant usage on schema private to anon;
grant execute on function private.preview_invitation(text) to anon, authenticated;
grant execute on function private.accept_member_invitation(text) to authenticated;

create function public.preview_invitation(invite_token text)
returns table (organization_name text, organization_code text, invitee_name text, email_required boolean, status text, expires_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.preview_invitation(invite_token); $$;

create function public.accept_member_invitation(invite_token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.accept_member_invitation(invite_token); $$;

revoke all on function public.preview_invitation(text) from public;
revoke all on function public.accept_member_invitation(text) from public, anon;
grant execute on function public.preview_invitation(text) to anon, authenticated;
grant execute on function public.accept_member_invitation(text) to authenticated;
