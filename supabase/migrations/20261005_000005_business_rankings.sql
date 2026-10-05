begin;

create table public.business_registry (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(trim(business_name)) between 1 and 200),
  business_address text,
  city text,
  state text,
  zip_code text,
  ownership_status text not null default 'unverified'
    check (ownership_status in ('unverified', 'verified_black_owned', 'not_black_owned')),
  sigma_owned boolean,
  verification_note text,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ownership_status = 'unverified' or length(trim(coalesce(verification_note, ''))) > 0)
);

alter table public.submissions add column business_id uuid references public.business_registry(id);
create index submissions_business_id_idx on public.submissions(business_id);

create table public.business_review_history (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.business_registry enable row level security;
alter table public.business_review_history enable row level security;
create policy "admin registry read" on public.business_registry for select to authenticated using ((select public.is_admin()));
create policy "admin review history read" on public.business_review_history for select to authenticated using ((select public.is_admin()));
revoke all on public.business_registry, public.business_review_history from anon, authenticated;
grant select on public.business_registry, public.business_review_history to authenticated;

-- Existing member insert/update policies must not allow self-assigned business matches.
create function public.guard_submission_business_match() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.business_id is not null)
     or (tg_op = 'UPDATE' and new.business_id is distinct from old.business_id) then
    if not public.is_admin() then
      raise exception 'Business matching requires an administrator' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_submission_business_match before insert or update on public.submissions
for each row execute function public.guard_submission_business_match();

-- One snapshot avoids API row limits and never signs or exposes receipt files.
create function public.admin_business_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'businesses', coalesce((select jsonb_agg(to_jsonb(b) order by b.business_name, b.id) from public.business_registry b), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'user_id', s.firebase_uid, 'business_id', s.business_id,
      'business_name', s.business_name, 'receipt_date', s.receipt_date,
      'amount_spent', s.amount_spent, 'status', s.status, 'category', s.category,
      'business_address', s.business_address, 'city', s.city, 'state', s.state,
      'zip_code', s.zip_code, 'legacy_ownership', s.black_owned_status,
      'duplicate_flag', s.duplicate_flag
    ) order by s.id) from public.submissions s), '[]'::jsonb),
    'year_totals', coalesce((select jsonb_agg(to_jsonb(t) order by t.year) from (
      select extract(year from s.receipt_date)::integer as year,
        sum(s.amount_spent) as total, count(*) as receipts
      from public.submissions s where s.status = 'approved' and s.receipt_date is not null group by 1
    ) t), '[]'::jsonb)
  );
end $$;

create function public.confirm_business_match(
  p_submission_ids uuid[], p_business_id uuid, p_new_business jsonb, p_expected_business_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; affected integer; expected integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select count(distinct x) into expected from unnest(p_submission_ids) x;
  if expected < 1 or expected > 500 or expected <> cardinality(p_submission_ids) then
    raise exception 'Select between 1 and 500 unique receipts';
  end if;
  if p_business_id is not null and p_new_business is not null then raise exception 'Choose one target'; end if;
  target := p_business_id;
  if target is null then
    if p_new_business is null then raise exception 'Provide a business record'; end if;
    insert into public.business_registry(business_name,business_address,city,state,zip_code)
    values (trim(p_new_business->>'business_name'), nullif(trim(p_new_business->>'business_address'),''),
      nullif(trim(p_new_business->>'city'),''), nullif(trim(p_new_business->>'state'),''),
      nullif(trim(p_new_business->>'zip_code'),'')) returning id into target;
  elsif not exists(select 1 from public.business_registry where id = target) then
    raise exception 'Business not found';
  end if;
  update public.submissions set business_id = target
  where id = any(p_submission_ids) and business_id is not distinct from p_expected_business_id;
  get diagnostics affected = row_count;
  if affected <> expected then raise exception 'Receipts changed since loading. Refresh and review again.'; end if;
  insert into public.business_review_history(actor_id,action,details)
  values(auth.uid(),'match',jsonb_build_object('submission_ids',p_submission_ids,'from',p_expected_business_id,'to',target));
  return target;
end $$;

create function public.unlink_business_match(p_submission_ids uuid[], p_expected_business_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare affected integer; expected integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select count(distinct x) into expected from unnest(p_submission_ids) x;
  if p_expected_business_id is null or expected < 1 or expected > 500 or expected <> cardinality(p_submission_ids) then
    raise exception 'Select matched receipts';
  end if;
  update public.submissions set business_id = null
  where id = any(p_submission_ids) and business_id = p_expected_business_id;
  get diagnostics affected = row_count;
  if affected <> expected then raise exception 'Receipts changed since loading. Refresh and review again.'; end if;
  insert into public.business_review_history(actor_id,action,details)
  values(auth.uid(),'unlink',jsonb_build_object('submission_ids',p_submission_ids,'from',p_expected_business_id));
end $$;

create function public.review_business_ownership(p_business_id uuid, p_status text, p_sigma_owned boolean,
  p_note text, p_expected_updated_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare previous jsonb; affected integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select to_jsonb(b) into previous from public.business_registry b where id = p_business_id for update;
  update public.business_registry set ownership_status = p_status, sigma_owned = p_sigma_owned,
    verification_note = nullif(trim(p_note),''), reviewed_by = auth.uid(), updated_at = clock_timestamp()
  where id = p_business_id and updated_at = p_expected_updated_at;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Business changed since loading. Refresh and review again.'; end if;
  insert into public.business_review_history(actor_id,action,details)
  values(auth.uid(),'ownership',jsonb_build_object('business_id',p_business_id,'before',previous,
    'ownership_status',p_status,'sigma_owned',p_sigma_owned,'note',p_note));
end $$;

revoke all on function public.guard_submission_business_match() from public, anon, authenticated;
revoke all on function public.admin_business_snapshot() from public, anon, authenticated;
revoke all on function public.confirm_business_match(uuid[],uuid,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.unlink_business_match(uuid[],uuid) from public, anon, authenticated;
revoke all on function public.review_business_ownership(uuid,text,boolean,text,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_business_snapshot() to authenticated;
grant execute on function public.confirm_business_match(uuid[],uuid,jsonb,uuid) to authenticated;
grant execute on function public.unlink_business_match(uuid[],uuid) to authenticated;
grant execute on function public.review_business_ownership(uuid,text,boolean,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
