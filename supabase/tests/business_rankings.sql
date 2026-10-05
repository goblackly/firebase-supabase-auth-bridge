-- Operator integration test: every write is rolled back, including test records and links.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',auth_user_id,'role','authenticated')::text,true)
from public.users where role = 'admin' and auth_user_id is not null limit 1;
select set_config('test.member_claims', jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true),
  set_config('test.member_receipt',s.id::text,true)
from public.users u join public.submissions s on s.firebase_uid = u.firebase_uid
where u.role = 'member' and u.auth_user_id is not null limit 1;
set local role authenticated;
do $$
declare before_state jsonb; after_state jsonb; rid uuid; target uuid; v_updated timestamptz; m jsonb;
begin
  if not public.is_admin() then raise exception 'Test requires an existing admin'; end if;
  before_state := public.admin_business_snapshot();
  select (r->>'id')::uuid into rid from jsonb_array_elements(before_state->'submissions') r
    where r->>'business_id' is null limit 1;
  if rid is null then raise exception 'Test requires an unmatched receipt'; end if;
  target := public.confirm_business_match(array[rid],null,'{"business_name":"Integration test branch"}'::jsonb,null);
  if not exists(select 1 from public.business_registry where id = target and ownership_status = 'unverified' and sigma_owned is null) then
    raise exception 'New records must not inherit legacy ownership'; end if;
  after_state := public.admin_business_snapshot();
  if before_state->'year_totals' <> after_state->'year_totals' then raise exception 'Matching changed financial totals'; end if;
  select updated_at into v_updated from public.business_registry where id = target;
  begin
    perform public.confirm_business_match(array[rid],target,null,null);
    raise exception 'Stale match unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm = 'Stale match unexpectedly allowed' then raise; end if;
  end;
  begin
    perform public.review_business_ownership(target,'verified_black_owned',true,'',v_updated);
    raise exception 'Missing verification note unexpectedly allowed';
  exception when check_violation then null;
  end;
  perform public.review_business_ownership(target,'verified_black_owned',true,'Rollback-only test verification',v_updated);
  begin
    perform public.review_business_ownership(target,'not_black_owned',false,'Stale test',v_updated);
    raise exception 'Stale ownership review unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm = 'Stale ownership review unexpectedly allowed' then raise; end if;
  end;
  perform public.unlink_business_match(array[rid],target);
  after_state := public.admin_business_snapshot();
  if before_state->'submissions' <> after_state->'submissions' then raise exception 'Review changed original receipt fields'; end if;
  if (select count(*) from public.business_review_history where details->>'business_id' = target::text or details->>'to' = target::text or details->>'from' = target::text) <> 3 then
    raise exception 'Review history incomplete'; end if;

  perform set_config('request.jwt.claims',current_setting('test.member_claims'),true);
  if public.is_admin() then raise exception 'Member test context is invalid'; end if;
  begin
    perform public.admin_business_snapshot();
    raise exception 'Member snapshot unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.confirm_business_match(array[rid],target,null,null);
    raise exception 'Member match unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  if exists(select 1 from public.business_registry) then raise exception 'Member can read admin registry'; end if;
  if exists(select 1 from public.business_review_history) then raise exception 'Member can read admin history'; end if;
  select to_jsonb(s) into m from public.submissions s where id = current_setting('test.member_receipt')::uuid;
  if m is null then raise exception 'Member receipt required for insert guard test'; end if;
  m := m || jsonb_build_object('id',gen_random_uuid(),'business_id',null,'firebase_doc_id',null,'status','pending');
  insert into public.submissions select * from jsonb_populate_record(null::public.submissions,m);
  begin
    update public.submissions set business_id = target where id = (m->>'id')::uuid;
    raise exception 'Member self-match unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.submissions select * from jsonb_populate_record(null::public.submissions,
      m || jsonb_build_object('id',gen_random_uuid(),'business_id',target));
    raise exception 'Member insert with match unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon','public.admin_business_snapshot()','execute') then raise exception 'Anonymous snapshot access'; end if;
  if has_table_privilege('authenticated','public.business_registry','insert') then raise exception 'Direct registry inserts allowed'; end if;
  if has_table_privilege('authenticated','public.business_registry','update') then raise exception 'Direct registry updates allowed'; end if;
end $$;
rollback;
select 'PASS: totals, original fields, admin review, ownership evidence, stale writes, member RLS, member insert guards, and anonymous access; all test writes rolled back' as result;
