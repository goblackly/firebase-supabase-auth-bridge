begin;

create function public.demo_pending_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.account_mode()='normal' then
    raise exception 'Demo session required';
  end if;
  return (select jsonb_build_object('count',count(*),'spend',coalesce(sum(amount_spent),0))
    from public.submissions where not is_demo and status='pending');
end $$;

revoke all on function public.demo_pending_summary() from public, anon;
grant execute on function public.demo_pending_summary() to authenticated;

commit;
