create or replace function public.current_request_uid()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when coalesce(auth.jwt() ->> 'sub', '') <> '' then auth.jwt() ->> 'sub'
    when auth.uid() is not null then auth.uid()::text
    else null
  end
$function$;

create or replace function public.current_firebase_uid()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    case
      when (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/studio-8577800676-7ae71'
      then auth.jwt() ->> 'sub'
      else null
    end,
    (
      select u.firebase_uid
      from public.users u
      where u.auth_user_id::text = (select public.current_request_uid())
      limit 1
    ),
    (select public.current_request_uid())
  )
$function$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select u.role
  from public.users u
  where (
    u.firebase_uid = (select public.current_firebase_uid())
    or u.auth_user_id::text = (select public.current_request_uid())
  )
  limit 1
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select public.current_user_role()) = 'admin', false)
$function$;

drop policy if exists "users update policy" on public.users;

create policy "users update policy"
on public.users
for update
to authenticated
using (
  (select public.is_admin())
  or firebase_uid = (select public.current_firebase_uid())
  or auth_user_id::text = (select public.current_request_uid())
)
with check (
  (select public.is_admin())
  or (
    firebase_uid = (select public.current_firebase_uid())
    and role = (select public.current_user_role())
  )
);

grant execute on function public.current_request_uid() to anon, authenticated, service_role;
grant execute on function public.current_firebase_uid() to anon, authenticated, service_role;
grant execute on function public.current_user_role() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;