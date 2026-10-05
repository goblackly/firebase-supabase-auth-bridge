import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('directory migration, matching, reports and demo isolation against PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.role',true),''),'authenticated')$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid())$$;
      grant usage on schema auth,storage to authenticated;
      grant execute on all functions in schema auth to authenticated;
      create table public.users(auth_user_id uuid references auth.users,firebase_uid text primary key,role text,email text,first_name text,last_name text,created_at timestamptz default now());
      create table public.submissions(id uuid primary key default gen_random_uuid(),firebase_uid text,auth_user_id uuid,user_name text,receipt_date date,
        business_name text,amount_spent numeric,sigma_members_attended integer,receipt_file_url text,category text,black_owned_status text,
        city text,state text,business_address text,zip_code text,notes text,status text,duplicate_flag boolean,admin_notes text,created_at timestamptz default now(),updated_at timestamptz default now());
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      create table public.yearly_goals(id uuid,goal_amount numeric); create table public.monthly_goals(id uuid,goal_amount numeric);
      create table public.mail(id uuid,created_by uuid);
      alter table public.yearly_goals enable row level security; alter table public.monthly_goals enable row level security;
      create policy baseline_yearly on public.yearly_goals for all to authenticated using(true) with check(true);
      create policy baseline_monthly on public.monthly_goals for all to authenticated using(true) with check(true);
      insert into public.yearly_goals values(gen_random_uuid(),1000);
      alter table public.users enable row level security; alter table public.submissions enable row level security;
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on public.users,public.submissions,storage.objects,public.yearly_goals,public.monthly_goals to authenticated;
      create policy baseline_users on public.users for all to authenticated using(true) with check(true);
      create policy baseline_receipts on public.submissions for all to authenticated using(true) with check(true);
      create policy baseline_storage on storage.objects for all to authenticated using(true) with check(true);
      create function public.current_firebase_uid() returns text language sql stable security definer as $$select firebase_uid from public.users where auth_user_id=auth.uid()$$;
      create function public.current_user_role() returns text language sql stable security definer as $$select role from public.users where auth_user_id=auth.uid()$$;
      create function public.is_admin() returns boolean language sql stable security definer as $$select coalesce(public.current_user_role()='admin',false)$$;
    `);
    for (const file of ['20261005_000005_business_rankings.sql', '20261006_000006_directory_demo.sql', '20261006_000007_complete_business_addresses.sql', '20261006_000008_demo_pending_summary.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    for (const address of ['N. Greenwood Ave', 'A spot with a blend of culture', '123', '']) {
      assert.equal((await db.query<{ identity: string | null }>('select public.business_identity($1,$2,$3,$4) identity',
        ['A spot with a blend of culture', address, 'Smyrna', 'DE'])).rows[0].identity, null);
    }
    await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
      insert into public.users(auth_user_id,firebase_uid,role,email,first_name,last_name,account_mode) values
      ('00000000-0000-0000-0000-000000000001','admin','admin','admin@example.com','Admin','Test','normal'),
      ('00000000-0000-0000-0000-000000000002','brother','member','brother@example.com','Brother','Test','normal'),
      ('00000000-0000-0000-0000-000000000003','demo','admin','demo@example.com','Demo','Test','demo_admin');
      insert into storage.objects(bucket_id,name) values('receipts','brother/test.jpg'),('receipts','demo/test.jpg');
      select set_config('request.uid','00000000-0000-0000-0000-000000000002',false); set role authenticated;`);
    const receipt = { business_name: "Joe's BBQ", business_address: '12 Elm St', city: 'Newark', state: 'NJ',
      receipt_date: '2026-09-30', amount_spent: 10, sigma_members_attended: 1, receipt_file_url: 'supabase://receipts/brother/test.jpg', category: 'Restaurant', black_owned_status: 'yes' };
    const submit = async (r = receipt) => (await db.query<{ id: string }>('select public.submit_business_receipt($1::jsonb) id', [JSON.stringify(r)])).rows[0].id;
    const first = await submit();
    const second = await submit({ ...receipt, business_name: 'JOES BBQ', business_address: '12 Elm St.' });
    const branch = await submit({ ...receipt, business_address: '14 Elm St', phone: '5551231234' } as any);
    const incompleteA = await submit({ ...receipt, business_address: '' });
    const incompleteB = await submit({ ...receipt, business_address: '' });
    await db.exec(`reset role; update public.submissions set status='approved' where id in ('${first}','${second}');`);
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from public.business_registry')).rows[0].n, 4);
    await db.exec('set role authenticated');
    const directory = (await db.query<{ data: any[] }>('select public.business_catalog(true) data')).rows[0].data;
    assert.equal(directory.length, 1); assert.equal(directory[0].ownership_status, 'unverified');
    assert.equal('email' in directory[0], false); assert.equal('receipt_file_url' in directory[0], false);
    await assert.rejects(submit({ ...receipt, website: 'javascript:alert(1)' } as any));
    await assert.rejects(submit({ ...receipt, receipt_file_url: 'supabase://receipts/admin/stolen.jpg' }));
    await assert.rejects(submit({ ...receipt, amount_spent: null } as any));
    await assert.rejects(submit({ ...receipt, amount_spent: 'NaN' } as any));
    await db.exec(`select set_config('request.uid','00000000-0000-0000-0000-000000000003',false)`);
    const demoId = await submit({ ...receipt, receipt_file_url: 'supabase://receipts/demo/test.jpg' });
    await db.exec(`update public.submissions set status='approved' where id='${demoId}'`);
    const report = (await db.query<{ data: any }>('select public.demo_report_snapshot() data')).rows[0].data;
    assert.equal(report.submissions.length, 2);
    const pending = (await db.query<{ data: any }>('select public.demo_pending_summary() data')).rows[0].data;
    assert.deepEqual(Object.keys(pending).sort(), ['count', 'spend']);
    assert.equal(Number(pending.count), 3);
    assert.equal(Number(pending.spend), 30);
    assert.equal(report.submissions.reduce((n: number,r: any) => n + Number(r.amount_spent),0),20);
    assert.ok(report.submissions.every((r: any) => !r.receipt_file_url && !r.notes));
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from public.submissions')).rows[0].n, 1);
    await assert.rejects(db.query(`update public.submissions set amount_spent=500 where id=$1`,[demoId]));
    assert.equal((await db.query(`update public.users set account_mode='normal' where firebase_uid='demo' returning firebase_uid`)).rows.length,0);
    await assert.rejects(db.query('select public.apply_historical_business_links()'));
    assert.equal((await db.query('delete from public.yearly_goals returning id')).rows.length,0);
    assert.equal((await db.query('update public.yearly_goals set goal_amount=1 returning id')).rows.length,0);
    assert.equal((await db.query("select name from storage.objects where name='brother/test.jpg'")).rows.length,0);
    await db.exec(`reset role; select set_config('request.uid','00000000-0000-0000-0000-000000000001',false); set role authenticated;`);
    const snapshot = (await db.query<{ data: any }>('select public.admin_business_snapshot() data')).rows[0].data;
    assert.equal(Number(snapshot.year_totals[0].total),20);
    assert.equal(snapshot.businesses.length,4);
    const ids = (await db.query<{id:string;business_id:string}>('select id,business_id from public.submissions where id=any($1::uuid[])',[[first,branch,incompleteA,incompleteB]])).rows;
    assert.notEqual(ids.find(r=>r.id===incompleteA)!.business_id,ids.find(r=>r.id===incompleteB)!.business_id);
    const source=ids.find(r=>r.id===branch)!.business_id, target=ids.find(r=>r.id===first)!.business_id;
    const event=(await db.query<{event:number}>('select public.consolidate_businesses($1,$2) event',[source,target])).rows[0].event;
    assert.equal((await db.query<{business_id:string}>('select business_id from public.submissions where id=$1',[branch])).rows[0].business_id,target);
    await db.query('select public.undo_business_consolidation($1)',[event]);
    assert.equal((await db.query<{business_id:string}>('select business_id from public.submissions where id=$1',[branch])).rows[0].business_id,source);
    await db.query('select public.archive_demo_receipts($1)',['00000000-0000-0000-0000-000000000003']);
    assert.equal(Number((await db.query<{data:any}>('select public.admin_business_snapshot() data')).rows[0].data.year_totals[0].total),20);
    await db.exec(`select set_config('request.uid','00000000-0000-0000-0000-000000000003',false);`);
    assert.equal((await db.query('select id from public.submissions')).rows.length,0);
    await db.exec("reset role; set role anon; select set_config('request.uid','',false);");
    await assert.rejects(db.query('select public.business_catalog(true)'));
    await assert.rejects(db.query('select public.demo_pending_summary()'));
  } finally { await db.close(); }
});
