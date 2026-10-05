begin;

alter table public.users add column account_mode text not null default 'normal'
  check (account_mode in ('normal','demo_member','demo_admin'));
alter table public.submissions add column is_demo boolean not null default false;
alter table public.submissions add column demo_archived_at timestamptz;
alter table public.business_registry add column is_demo boolean not null default false;
alter table public.business_registry add column phone text;
alter table public.business_registry add column website text check (website is null or website ~ '^https?://');
alter table public.business_registry add column category text;
alter table public.business_registry add column retired_into uuid references public.business_registry(id);

create function public.account_mode() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select account_mode from public.users where auth_user_id = auth.uid()), 'normal')
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() = 'admin' and public.account_mode() = 'normal',false)
$$;
create function public.can_view_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.account_mode() = 'demo_admin'
$$;

-- A restrictive policy intersects existing policies; it never widens their access.
create policy demo_private_users on public.users as restrictive for select to authenticated
  using (public.account_mode() = 'normal' or auth_user_id = auth.uid());
create policy demo_private_receipts on public.submissions as restrictive for select to authenticated
  using (demo_archived_at is null and (public.account_mode() = 'normal' or (is_demo and (auth_user_id = auth.uid() or public.account_mode() = 'demo_admin'))));
create policy demo_review_read on public.submissions for select to authenticated
  using (public.account_mode() = 'demo_admin' and is_demo);
create policy demo_review_update on public.submissions for update to authenticated
  using (public.account_mode() = 'demo_admin' and is_demo) with check (is_demo);
create policy demo_no_delete on public.submissions as restrictive for delete to authenticated
  using (public.account_mode() = 'normal');
create policy demo_no_user_changes on public.users as restrictive for update to authenticated
  using (public.account_mode() = 'normal') with check (public.account_mode() = 'normal');
create policy demo_no_user_delete on public.users as restrictive for delete to authenticated using (public.account_mode() = 'normal');
create policy demo_no_user_insert on public.users as restrictive for insert to authenticated with check (public.account_mode() = 'normal');
create policy demo_storage_read on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'receipts' or public.account_mode() = 'normal' or exists (
    select 1 from public.submissions s where s.is_demo and s.receipt_file_url = 'supabase://receipts/' || name
      and (s.auth_user_id = auth.uid() or public.account_mode() = 'demo_admin'))
    or (split_part(name,'/',1) = public.current_firebase_uid()));
create policy demo_storage_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'receipts' or public.account_mode() = 'normal') with check (bucket_id <> 'receipts' or public.account_mode() = 'normal');
create policy demo_storage_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'receipts' or public.account_mode() = 'normal');
do $$ declare t text; begin
  foreach t in array array['yearly_goals','monthly_goals'] loop
    execute format('create policy demo_no_insert on public.%I as restrictive for insert to authenticated with check (public.account_mode()=''normal'')',t);
    execute format('create policy demo_no_update on public.%I as restrictive for update to authenticated using (public.account_mode()=''normal'') with check (public.account_mode()=''normal'')',t);
    execute format('create policy demo_no_delete on public.%I as restrictive for delete to authenticated using (public.account_mode()=''normal'')',t);
  end loop;
end $$;
create policy demo_no_mail_enqueue on public.mail as restrictive for insert to authenticated
  with check (public.account_mode()='normal');

create function public.guard_demo_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_admin() and new.auth_user_id is distinct from auth.uid() then
      raise exception 'Create profiles only for your own account';
    end if;
    if new.account_mode <> 'normal' or (new.role <> 'member' and not public.is_admin()) then raise exception 'Protected account fields'; end if;
  elsif (new.account_mode is distinct from old.account_mode or new.role is distinct from old.role
    or new.auth_user_id is distinct from old.auth_user_id or new.firebase_uid is distinct from old.firebase_uid) and not public.is_admin() then
    raise exception 'Protected account fields';
  end if;
  return new;
end $$;
create trigger guard_demo_profile before insert or update on public.users for each row execute function public.guard_demo_profile();

create function public.guard_demo_submission() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.firebase_uid = public.current_firebase_uid() and new.auth_user_id is null then
      new.auth_user_id := auth.uid();
    end if;
    if auth.uid() is not null and not public.is_admin() and
      (new.auth_user_id is distinct from auth.uid() or new.firebase_uid is distinct from public.current_firebase_uid()) then
      raise exception 'Submit receipts only for your own account';
    end if;
    new.is_demo := public.account_mode() <> 'normal';
  elsif auth.uid() is not null and auth.role() <> 'service_role' then
    if new.is_demo is distinct from old.is_demo then raise exception 'Demo designation cannot change'; end if;
    if public.account_mode() = 'demo_admin' then
      if not old.is_demo or (to_jsonb(new) - array['status','admin_notes','duplicate_flag','updated_at'])
        is distinct from (to_jsonb(old) - array['status','admin_notes','duplicate_flag','updated_at']) then
        raise exception 'Demo administrators can review demo receipts only';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger guard_demo_submission before insert or update on public.submissions for each row execute function public.guard_demo_submission();

create function public.business_normalize(value text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(value,'')), '[^[:alnum:]]', '', 'g')
$$;
create function public.business_identity(n text,a text,c text,s text) returns text language sql immutable set search_path = '' as $$
  select case when trim(coalesce(n,'')) <> '' and trim(coalesce(a,'')) <> '' and trim(coalesce(c,'')) <> '' and trim(coalesce(s,'')) <> ''
    and public.business_normalize(n)<>'' and public.business_normalize(a)<>'' and public.business_normalize(c)<>'' and public.business_normalize(s)<>''
    then public.business_normalize(n) || '|' || public.business_normalize(a) || '|' || public.business_normalize(c) || '|' || public.business_normalize(s) end
$$;

-- Only safe exact complete identities are unique. Incomplete and ambiguous branches stay separate.
create unique index registry_complete_identity on public.business_registry
  (public.business_identity(business_name,business_address,city,state),is_demo)
  where retired_into is null and public.business_identity(business_name,business_address,city,state) is not null;

create function public.business_catalog(p_directory boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'business_name',b.business_name,
    'business_address',b.business_address,'city',b.city,'state',b.state,'zip_code',b.zip_code,
    'phone',b.phone,'website',b.website,'category',b.category,'ownership_status',b.ownership_status,
    'sigma_owned',b.sigma_owned,'updated_at',b.updated_at,
    'categories',coalesce((select jsonb_agg(distinct s.category) from public.submissions s where s.business_id=b.id and not s.is_demo and s.status='approved'),'[]'::jsonb))
    order by b.business_name,b.city,b.id) from public.business_registry b
    where not b.is_demo and b.retired_into is null and (not p_directory or exists (
      select 1 from public.submissions s where s.business_id=b.id and not s.is_demo and s.status='approved'))),'[]'::jsonb);
end $$;

create function public.submit_business_receipt(p_receipt jsonb,p_business_id uuid default null,p_business_version timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u public.users; b public.business_registry; target uuid; identity_key text; demo boolean; receipt_id uuid;
begin
  select * into u from public.users where auth_user_id=auth.uid();
  if u.auth_user_id is null then raise exception 'Member profile required'; end if;
  demo := u.account_mode <> 'normal';
  if coalesce(p_receipt->>'receipt_file_url','') not like 'supabase://receipts/' || u.firebase_uid || '/%' then
    raise exception 'Receipt must be uploaded to your own storage folder'; end if;
  if not exists(select 1 from storage.objects where bucket_id='receipts' and name=substring(p_receipt->>'receipt_file_url' from 21)) then
    raise exception 'Uploaded receipt not found'; end if;
  if length(trim(coalesce(p_receipt->>'business_name',''))) not between 1 and 200
    or trim(coalesce(p_receipt->>'city',''))='' or trim(coalesce(p_receipt->>'state',''))='' then
    raise exception 'Business name, city, and state are required'; end if;
  if p_receipt->>'receipt_date' is null or p_receipt->>'category' is null or p_receipt->>'black_owned_status' is null then
    raise exception 'Receipt date, category, and Sigma ownership response are required'; end if;
  if p_receipt->>'black_owned_status' not in ('yes','no') or trim(p_receipt->>'category')='' then
    raise exception 'Invalid category or Sigma ownership response'; end if;
  if coalesce((p_receipt->>'amount_spent')::numeric,0) <= 0 or (p_receipt->>'amount_spent')::numeric > 100000000
    or coalesce((p_receipt->>'sigma_members_attended')::integer,0) < 1 then
    raise exception 'Enter a positive amount and member count'; end if;
  if nullif(p_receipt->>'website','') is not null and p_receipt->>'website' !~ '^https?://' then raise exception 'Use a full http or https website URL'; end if;
  if p_business_id is not null then
    select * into b from public.business_registry where id=p_business_id and not is_demo and retired_into is null for share;
    if b.id is null or b.updated_at is distinct from p_business_version then raise exception 'Business changed. Please reselect it; your draft is saved.'; end if;
    if public.business_normalize(b.business_name) <> public.business_normalize(p_receipt->>'business_name') or
      (nullif(b.business_address,'') is not null and public.business_normalize(b.business_address) <> public.business_normalize(p_receipt->>'business_address')) or
      (nullif(b.city,'') is not null and public.business_normalize(b.city) <> public.business_normalize(p_receipt->>'city')) or
      (nullif(b.state,'') is not null and public.business_normalize(b.state) <> public.business_normalize(p_receipt->>'state')) then
      raise exception 'Selected branch details changed. Reselect the business or choose Add a new business.';
    end if;
    target := b.id;
  end if;
  if target is null or demo then
    identity_key := public.business_identity(p_receipt->>'business_name',p_receipt->>'business_address',p_receipt->>'city',p_receipt->>'state');
    if identity_key is not null then
      perform pg_advisory_xact_lock(hashtextextended(identity_key || demo::text,0));
      select id into target from public.business_registry where retired_into is null and is_demo=demo
        and public.business_identity(business_name,business_address,city,state)=identity_key;
    else target := null;
    end if;
    if target is null then
      insert into public.business_registry(business_name,business_address,city,state,zip_code,phone,website,category,is_demo)
      values(trim(p_receipt->>'business_name'),nullif(trim(p_receipt->>'business_address'),''),trim(p_receipt->>'city'),trim(p_receipt->>'state'),
        nullif(trim(p_receipt->>'zip_code'),''),nullif(trim(p_receipt->>'phone'),''),nullif(trim(p_receipt->>'website'),''),p_receipt->>'category',demo) returning id into target;
    end if;
  end if;
  insert into public.submissions(firebase_uid,auth_user_id,user_name,receipt_date,business_name,amount_spent,
    sigma_members_attended,receipt_file_url,category,black_owned_status,city,state,business_address,zip_code,notes,status,business_id,is_demo)
  values(u.firebase_uid,u.auth_user_id,trim(u.first_name||' '||u.last_name),(p_receipt->>'receipt_date')::date,trim(p_receipt->>'business_name'),
    (p_receipt->>'amount_spent')::numeric,(p_receipt->>'sigma_members_attended')::integer,p_receipt->>'receipt_file_url',p_receipt->>'category',
    p_receipt->>'black_owned_status',p_receipt->>'city',p_receipt->>'state',p_receipt->>'business_address',p_receipt->>'zip_code',p_receipt->>'notes','pending',target,demo)
    returning id into receipt_id;
  return receipt_id;
end $$;

-- The validated owner-executed submission RPC is the sole member business-link insertion path.
create or replace function public.guard_submission_business_match() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.business_id is not null and (tg_op='INSERT' or new.business_id is distinct from old.business_id)
    and not exists(select 1 from public.business_registry
    where id=new.business_id and retired_into is null and is_demo=new.is_demo) then
    raise exception 'Business and receipt must belong to the same active real or demo registry';
  end if;
  if current_user not in ('postgres','supabase_admin') and not public.is_admin() and
    ((tg_op='INSERT' and new.business_id is not null) or (tg_op='UPDATE' and new.business_id is distinct from old.business_id)) then
    raise exception 'Use the validated business submission flow';
  end if;
  return new;
end $$;

create function public.historical_business_preview() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Full admin required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t)) from (select public.business_identity(business_name,business_address,city,state) identity,
    array_agg(id order by id) receipt_ids, count(*) receipts, min(business_name) name, min(business_address) address,min(city) city,min(state) state
    from public.submissions where business_id is null and not is_demo
    group by public.business_identity(business_name,business_address,city,state),
      case when public.business_identity(business_name,business_address,city,state) is null then id end) t),'[]'::jsonb);
end $$;

create function public.apply_historical_business_links() returns integer language plpgsql security definer set search_path = '' as $$
declare s public.submissions; target uuid; identity_key text; linked integer := 0;
begin
  if not public.is_admin() then raise exception 'Full admin required'; end if;
  for s in select * from public.submissions where business_id is null and not is_demo order by id for update loop
    identity_key := public.business_identity(s.business_name,s.business_address,s.city,s.state);
    if identity_key is null then continue; end if;
    target := null;
    if identity_key is not null then
      perform pg_advisory_xact_lock(hashtextextended(identity_key || 'false',0));
      select id into target from public.business_registry where not is_demo and retired_into is null
        and public.business_identity(business_name,business_address,city,state)=identity_key;
    end if;
    if target is null then
      insert into public.business_registry(business_name,business_address,city,state,zip_code,category)
      values(s.business_name,s.business_address,s.city,s.state,s.zip_code,s.category) returning id into target;
    end if;
    update public.submissions set business_id=target where id=s.id;
    insert into public.business_review_history(actor_id,action,details) values(auth.uid(),'historical_link',jsonb_build_object('submission_id',s.id,'from',null,'to',target,'exact_complete',identity_key is not null));
    linked := linked+1;
  end loop;
  return linked;
end $$;

create function public.consolidate_businesses(p_source uuid,p_target uuid) returns bigint language plpgsql security definer set search_path = '' as $$
declare event_id bigint; ids uuid[];
begin
  if not public.is_admin() or p_source=p_target then raise exception 'Full admin and two different businesses required'; end if;
  perform 1 from public.business_registry where id in (p_source,p_target) and not is_demo and retired_into is null order by id for update;
  if (select count(*) from public.business_registry where id in (p_source,p_target) and not is_demo and retired_into is null)<>2 then raise exception 'Refresh business records'; end if;
  select array_agg(id) into ids from public.submissions where business_id=p_source;
  update public.submissions set business_id=p_target where business_id=p_source;
  update public.business_registry set retired_into=p_target,updated_at=clock_timestamp() where id=p_source;
  insert into public.business_review_history(actor_id,action,details) values(auth.uid(),'consolidate',jsonb_build_object('source',p_source,'target',p_target,'receipt_ids',coalesce(ids,'{}'::uuid[]))) returning id into event_id;
  return event_id;
end $$;
create function public.undo_business_consolidation(p_event bigint) returns void language plpgsql security definer set search_path = '' as $$
declare e public.business_review_history;
begin
  if not public.is_admin() then raise exception 'Full admin required'; end if;
  select * into e from public.business_review_history where id=p_event and action='consolidate' for update;
  if e.id is null or exists(select 1 from public.business_review_history where action='undo_consolidate' and details->>'event'=p_event::text) then raise exception 'Event not available'; end if;
  if exists(select 1 from public.submissions where id in (select value::uuid from jsonb_array_elements_text(e.details->'receipt_ids')) and business_id is distinct from (e.details->>'target')::uuid) then raise exception 'Receipts changed; manual review required'; end if;
  update public.business_registry set retired_into=null,updated_at=clock_timestamp() where id=(e.details->>'source')::uuid and retired_into=(e.details->>'target')::uuid;
  if not found then raise exception 'Business changed; manual review required'; end if;
  update public.submissions set business_id=(e.details->>'source')::uuid where id in (select value::uuid from jsonb_array_elements_text(e.details->'receipt_ids'));
  insert into public.business_review_history(actor_id,action,details) values(auth.uid(),'undo_consolidate',jsonb_build_object('event',p_event));
end $$;

-- Demo sessions receive reporting facts, never raw real receipt/contact columns.
create function public.demo_report_snapshot() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.account_mode()='normal' or auth.uid() is null then raise exception 'Demo session required'; end if;
  return jsonb_build_object('submissions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'firebase_uid',s.firebase_uid,
    'user_name',s.user_name,'receipt_date',s.receipt_date,'business_name',s.business_name,'amount_spent',s.amount_spent,
    'sigma_members_attended',s.sigma_members_attended,'category',s.category,'black_owned_status',s.black_owned_status,
    'city',s.city,'state',s.state,'business_address',s.business_address,'zip_code',s.zip_code,'status',s.status,
    'created_at',s.created_at,'updated_at',s.updated_at,'receipt_file_url','','is_demo',false))
    from public.submissions s where not s.is_demo and s.status='approved'),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object('firebase_uid',u.firebase_uid,'first_name',u.first_name,'last_name',u.last_name,
      'role','member','email','','created_at',u.created_at,'account_mode','normal')) from public.users u where u.account_mode='normal'),'[]'::jsonb));
end $$;

create function public.designate_demo_account(p_user uuid,p_mode text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or p_user=auth.uid() then raise exception 'Another full admin must designate this account'; end if;
  if p_mode not in ('normal','demo_member','demo_admin') then raise exception 'Invalid account mode'; end if;
  if exists(select 1 from public.submissions where auth_user_id=p_user and not is_demo) then raise exception 'Use an account with no real receipts'; end if;
  if p_mode='normal' and exists(select 1 from public.submissions where auth_user_id=p_user and is_demo and demo_archived_at is null) then raise exception 'Archive demo receipts before removing demo designation'; end if;
  update public.users set account_mode=p_mode where auth_user_id=p_user;
  if not found then raise exception 'Account not found'; end if;
  insert into public.business_review_history(actor_id,action,details) values(auth.uid(),'demo_designation',jsonb_build_object('user',p_user,'mode',p_mode));
end $$;

create function public.archive_demo_receipts(p_user uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Full admin required'; end if;
  if not exists(select 1 from public.users where auth_user_id=p_user and account_mode<>'normal') then raise exception 'Demo account required'; end if;
  update public.submissions set demo_archived_at=clock_timestamp() where auth_user_id=p_user and is_demo and demo_archived_at is null;
  get diagnostics n=row_count;
  insert into public.business_review_history(actor_id,action,details) values(auth.uid(),'demo_archive',jsonb_build_object('user',p_user,'receipts',n));
  return n;
end $$;

create or replace function public.admin_business_snapshot() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_view_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  return jsonb_build_object('generated_at',now(),
    'undo_event',case when public.is_admin() then (select max(e.id) from public.business_review_history e
      where e.action='consolidate' and not exists(select 1 from public.business_review_history u
        where u.action='undo_consolidate' and u.details->>'event'=e.id::text)) end,
    'businesses',coalesce((select jsonb_agg(case when public.is_admin() then to_jsonb(b)
      else to_jsonb(b)-array['verification_note','reviewed_by'] end order by b.business_name,b.id)
      from public.business_registry b where not b.is_demo and b.retired_into is null),'[]'::jsonb),
    'submissions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'user_id',s.firebase_uid,'business_id',s.business_id,
      'business_name',s.business_name,'receipt_date',s.receipt_date,'amount_spent',s.amount_spent,'status',s.status,'category',s.category,
      'business_address',s.business_address,'city',s.city,'state',s.state,'zip_code',s.zip_code,'legacy_ownership',s.black_owned_status,'duplicate_flag',s.duplicate_flag) order by s.id)
      from public.submissions s where not s.is_demo),'[]'::jsonb),
    'year_totals',coalesce((select jsonb_agg(to_jsonb(t)) from (select extract(year from receipt_date)::integer as year,sum(amount_spent) as total,count(*) as receipts
      from public.submissions where status='approved' and not is_demo group by 1) t),'[]'::jsonb));
end $$;

-- Remove anonymous execution defaults for every new callable function.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('account_mode','can_view_admin','business_catalog','submit_business_receipt',
      'historical_business_preview','apply_historical_business_links','consolidate_businesses','undo_business_consolidation','demo_report_snapshot','designate_demo_account','archive_demo_receipts') loop
    execute format('revoke all on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
